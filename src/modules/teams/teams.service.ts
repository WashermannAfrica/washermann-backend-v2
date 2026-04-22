import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from '../../database/entities/team.entity';
import { TeamMember } from '../../database/entities/team-member.entity';
import { User } from '../../database/entities/user.entity';
import { TeamMemberRole } from '../../common/enums/team-member-role.enum';
import { Role } from '../../common/enums/roles.enum';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  ChangeMemberRoleDto,
} from './dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    @InjectRepository(Team)
    private teamRepository: Repository<Team>,
    @InjectRepository(TeamMember)
    private memberRepository: Repository<TeamMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async createTeam(ownerId: string, dto: CreateTeamDto) {
    const team = this.teamRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      ownerId,
      industry: dto.industry ?? null,
      address: dto.address ?? null,
      website: dto.website ?? null,
      memberCount: dto.memberCount ?? null,
      isActive: true,
    });

    await this.teamRepository.save(team);

    // The creator is automatically the owner member
    const ownerMember = this.memberRepository.create({
      teamId: team.id,
      userId: ownerId,
      role: TeamMemberRole.OWNER,
      isActive: true,
      joinedAt: new Date(),
    });
    await this.memberRepository.save(ownerMember);

    // Grant TEAM_OWNER role if not already held
    const owner = await this.userRepository.findOne({ where: { id: ownerId } });
    if (owner && !owner.roles.includes(Role.TEAM_OWNER)) {
      owner.roles = [...owner.roles, Role.TEAM_OWNER];
      await this.userRepository.save(owner);
    }

    this.logger.log(`Team created: ${team.id} — "${team.name}" by user ${ownerId}`);

    return { data: team, message: 'Team created successfully' };
  }

  // ─── Read ─────────────────────────────────────────────────────────────────────

  async getMyTeams(userId: string) {
    const memberships = await this.memberRepository.find({
      where: { userId, isActive: true },
      relations: ['team'],
      order: { joinedAt: 'DESC' },
    });

    return {
      data: memberships
        .filter((m) => m.team?.isActive)
        .map((m) => ({
          memberRole: m.role,
          joinedAt: m.joinedAt,
          team: m.team,
        })),
    };
  }

  async getTeam(teamId: string, userId: string, callerRoles: Role[]) {
    await this.assertTeamAccess(teamId, userId, callerRoles);

    const team = await this.teamRepository.findOne({
      where: { id: teamId },
      relations: ['members', 'members.user'],
    });
    if (!team) throw new NotFoundException('Team not found');

    return { data: team };
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async updateTeam(
    teamId: string,
    dto: UpdateTeamDto,
    userId: string,
    callerRoles: Role[],
  ) {
    await this.assertTeamAccess(teamId, userId, callerRoles);

    const team = await this.findTeamOrFail(teamId);

    if (dto.name !== undefined)        team.name = dto.name;
    if (dto.description !== undefined) team.description = dto.description ?? null;
    if (dto.industry !== undefined)    team.industry = dto.industry ?? null;
    if (dto.address !== undefined)     team.address = dto.address ?? null;
    if (dto.website !== undefined)     team.website = dto.website ?? null;
    if (dto.memberCount !== undefined) team.memberCount = dto.memberCount ?? null;
    if (dto.isActive !== undefined)    team.isActive = dto.isActive;

    await this.teamRepository.save(team);

    return { data: team, message: 'Team updated' };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async deleteTeam(teamId: string, userId: string, callerRoles: Role[]) {
    await this.assertOwnerAccess(teamId, userId, callerRoles);

    const team = await this.findTeamOrFail(teamId);

    // Soft-delete: deactivate instead of hard delete to preserve ledger links
    team.isActive = false;
    await this.teamRepository.save(team);

    this.logger.log(`Team deactivated: ${team.id} — "${team.name}" by user ${userId}`);

    return { data: null, message: 'Team deactivated' };
  }

  // ─── Members ─────────────────────────────────────────────────────────────────

  async listMembers(teamId: string, userId: string, callerRoles: Role[]) {
    await this.assertTeamAccess(teamId, userId, callerRoles);

    const members = await this.memberRepository.find({
      where: { teamId, isActive: true },
      relations: ['user'],
      order: { role: 'ASC', joinedAt: 'ASC' }, // owners first
    });

    return { data: members.map((m) => this.sanitizeMember(m)) };
  }

  async addMember(
    teamId: string,
    dto: AddTeamMemberDto,
    callerId: string,
    callerRoles: Role[],
  ) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone is required');
    }

    await this.assertTeamAccess(teamId, callerId, callerRoles);
    await this.findTeamOrFail(teamId);

    const target = await this.userRepository.findOne({
      where: dto.email
        ? { email: dto.email.toLowerCase() }
        : { phone: dto.phone },
    });

    if (!target) {
      throw new NotFoundException(
        'No user found with this email or phone. Team members must have an existing Washermann account.',
      );
    }

    const existing = await this.memberRepository.findOne({
      where: { teamId, userId: target.id },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('User is already a member of this team');
      }
      existing.isActive = true;
      existing.joinedAt = new Date();
      await this.memberRepository.save(existing);
      return { data: this.sanitizeMember(existing), message: 'Member re-activated' };
    }

    const member = this.memberRepository.create({
      teamId,
      userId: target.id,
      role: TeamMemberRole.MEMBER,
      isActive: true,
      joinedAt: new Date(),
    });

    await this.memberRepository.save(member);

    return { data: this.sanitizeMember(member), message: 'Member added' };
  }

  async removeMember(
    teamId: string,
    memberId: string,
    callerId: string,
    callerRoles: Role[],
  ) {
    await this.assertTeamAccess(teamId, callerId, callerRoles);

    const member = await this.memberRepository.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) throw new NotFoundException('Member not found in this team');

    // Protect the owner from removal unless caller is also owner
    if (member.role === TeamMemberRole.OWNER) {
      await this.assertOwnerAccess(teamId, callerId, callerRoles);
      await this.assertNotLastOwner(teamId, member.userId);
    }

    member.isActive = false;
    await this.memberRepository.save(member);

    // Scrub TEAM_OWNER role if no more owned teams
    if (member.role === TeamMemberRole.OWNER) {
      const user = await this.userRepository.findOne({
        where: { id: member.userId },
      });
      if (user) {
        const stillOwner = await this.memberRepository.count({
          where: { userId: member.userId, role: TeamMemberRole.OWNER, isActive: true },
        });
        if (stillOwner === 0 && user.roles.includes(Role.TEAM_OWNER)) {
          user.roles = user.roles.filter((r) => r !== Role.TEAM_OWNER);
          await this.userRepository.save(user);
        }
      }
    }

    return { data: null, message: 'Member removed from team' };
  }

  async changeMemberRole(
    teamId: string,
    memberId: string,
    dto: ChangeMemberRoleDto,
    callerId: string,
    callerRoles: Role[],
  ) {
    // Only an owner can change roles (including promoting to owner = transfer)
    await this.assertOwnerAccess(teamId, callerId, callerRoles);

    const member = await this.memberRepository.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) throw new NotFoundException('Member not found in this team');

    // Cannot demote the last owner
    if (
      member.role === TeamMemberRole.OWNER &&
      dto.role !== TeamMemberRole.OWNER
    ) {
      await this.assertNotLastOwner(teamId, member.userId);
    }

    member.role = dto.role;
    await this.memberRepository.save(member);

    // Sync TEAM_OWNER JWT role
    const user = await this.userRepository.findOne({
      where: { id: member.userId },
    });
    if (user) {
      if (dto.role === TeamMemberRole.OWNER && !user.roles.includes(Role.TEAM_OWNER)) {
        user.roles = [...user.roles, Role.TEAM_OWNER];
        await this.userRepository.save(user);
      } else if (dto.role !== TeamMemberRole.OWNER) {
        const stillOwner = await this.memberRepository.count({
          where: { userId: user.id, role: TeamMemberRole.OWNER, isActive: true },
        });
        if (stillOwner === 0 && user.roles.includes(Role.TEAM_OWNER)) {
          user.roles = user.roles.filter((r) => r !== Role.TEAM_OWNER);
          await this.userRepository.save(user);
        }
      }
    }

    return { data: this.sanitizeMember(member), message: 'Member role updated' };
  }

  // ─── Access guards ────────────────────────────────────────────────────────────

  /**
   * Any active team member (OWNER, ADMIN, MEMBER) can view the team.
   * Platform admins bypass.
   */
  async assertTeamAccess(
    teamId: string,
    userId: string,
    callerRoles: Role[],
  ): Promise<void> {
    if (callerRoles.includes(Role.ADMIN)) return;

    const membership = await this.memberRepository.findOne({
      where: { teamId, userId, isActive: true },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this team');
    }
  }

  /**
   * Only the team OWNER (or platform ADMIN) can perform destructive operations.
   */
  async assertOwnerAccess(
    teamId: string,
    userId: string,
    callerRoles: Role[],
  ): Promise<void> {
    if (callerRoles.includes(Role.ADMIN)) return;

    const membership = await this.memberRepository.findOne({
      where: { teamId, userId, isActive: true },
    });

    if (!membership || membership.role !== TeamMemberRole.OWNER) {
      throw new ForbiddenException('Only the team owner can perform this action');
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async assertNotLastOwner(
    teamId: string,
    userId: string,
  ): Promise<void> {
    const ownerCount = await this.memberRepository.count({
      where: { teamId, role: TeamMemberRole.OWNER, isActive: true },
    });
    if (ownerCount <= 1) {
      throw new BadRequestException(
        'Cannot remove or demote the last team owner. Transfer ownership first.',
      );
    }
  }

  private async findTeamOrFail(teamId: string): Promise<Team> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  private sanitizeMember(m: TeamMember) {
    return {
      id: m.id,
      teamId: m.teamId,
      userId: m.userId,
      role: m.role,
      isActive: m.isActive,
      joinedAt: m.joinedAt,
      user: m.user
        ? {
            id: m.user.id,
            fullName: m.user.fullName,
            email: m.user.email,
            phone: m.user.phone,
          }
        : undefined,
    };
  }
}
