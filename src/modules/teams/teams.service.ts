import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Team } from '../../database/entities/team.entity';
import { TeamMember } from '../../database/entities/team-member.entity';
import { User } from '../../database/entities/user.entity';
import { TeamMemberRole } from '../../common/enums/team-member-role.enum';
import { Role } from '../../common/enums/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
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
    private dataSource: DataSource,
    private notifications: NotificationsService,
  ) {}

  /** Best-effort user full name (for notification copy). */
  private async userName(userId: string): Promise<string | null> {
    const u = await this.userRepository.findOne({ where: { id: userId }, select: ['id', 'fullName'] });
    return u?.fullName ?? null;
  }

  // ─── Create ───────────────────────────────────────────────────────────────────

  async createTeam(ownerId: string, dto: CreateTeamDto) {
    // Team + owner-member + role grant must all land together, or none.
    const team = await this.dataSource.transaction(async (manager) => {
      const t = manager.create(Team, {
        name: dto.name,
        description: dto.description ?? null,
        ownerId,
        industry: dto.industry ?? null,
        address: dto.address ?? null,
        website: dto.website ?? null,
        memberCount: 1, // the owner; kept in sync on every membership change
        isActive: true,
      });
      await manager.save(t);

      // The creator is automatically the owner member.
      await manager.save(
        manager.create(TeamMember, {
          teamId: t.id,
          userId: ownerId,
          role: TeamMemberRole.OWNER,
          isActive: true,
          joinedAt: new Date(),
        }),
      );

      // Grant TEAM_OWNER role if not already held.
      const owner = await manager.findOne(User, { where: { id: ownerId } });
      if (owner && !owner.roles.includes(Role.TEAM_OWNER)) {
        owner.roles = [...owner.roles, Role.TEAM_OWNER];
        await manager.save(owner);
      }
      return t;
    });

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

    // Only surface active members, and expose a SAFE subset of each member's
    // user (never the raw User entity — it carries passwordHash / tokens).
    const members = (team.members ?? []).filter((m) => m.isActive).map((m) => this.sanitizeMember(m));

    return { data: { ...team, members } };
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
    // memberCount is maintained automatically from the member rows — not user-set.
    if (dto.isActive !== undefined)    team.isActive = dto.isActive;

    await this.teamRepository.save(team);

    return { data: team, message: 'Team updated' };
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async deleteTeam(teamId: string, userId: string, callerRoles: Role[]) {
    await this.assertOwnerAccess(teamId, userId, callerRoles);

    const team = await this.findTeamOrFail(teamId);

    // Soft-delete: deactivate rather than hard-delete so historical references
    // survive. Scrub the owner's platform TEAM_OWNER role if they own no other
    // active team.
    team.isActive = false;
    await this.teamRepository.save(team);
    await this.scrubTeamOwnerRoleIfOrphaned(team.ownerId);

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

    // Only an OWNER or ADMIN (or platform admin) may add members.
    await this.assertManagerAccess(teamId, callerId, callerRoles);
    const team = await this.findTeamOrFail(teamId);

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
      await this.syncMemberCount(teamId);
      void this.notifications.notifyTeamMemberAdded({ userId: target.id, teamName: team.name, addedByName: await this.userName(callerId) });
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
    await this.syncMemberCount(teamId);
    void this.notifications.notifyTeamMemberAdded({ userId: target.id, teamName: team.name, addedByName: await this.userName(callerId) });

    return { data: this.sanitizeMember(member), message: 'Member added' };
  }

  async removeMember(
    teamId: string,
    memberId: string,
    callerId: string,
    callerRoles: Role[],
  ) {
    const member = await this.memberRepository.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) throw new NotFoundException('Member not found in this team');

    const isSelf = member.userId === callerId;

    // A member may always remove THEMSELVES (leave). Removing anyone else
    // requires OWNER/ADMIN (platform admin bypasses).
    if (!isSelf) {
      await this.assertManagerAccess(teamId, callerId, callerRoles);
    } else {
      await this.assertTeamAccess(teamId, callerId, callerRoles);
    }

    // Removing an OWNER: only an OWNER (or the owner leaving) may do it, and the
    // last owner cannot leave without transferring first.
    if (member.role === TeamMemberRole.OWNER) {
      if (!isSelf) await this.assertOwnerAccess(teamId, callerId, callerRoles);
      await this.assertNotLastOwner(teamId, member.userId);
    }

    member.isActive = false;
    await this.memberRepository.save(member);

    // If an owner left, keep the denormalised team.ownerId pointing at a real
    // remaining owner, and scrub their TEAM_OWNER role if they own nothing else.
    if (member.role === TeamMemberRole.OWNER) {
      await this.reassignTeamOwnerIfNeeded(teamId, member.userId);
      await this.scrubTeamOwnerRoleIfOrphaned(member.userId);
    }

    await this.syncMemberCount(teamId);

    // Notify the removed member — but not when they chose to leave themselves.
    if (!isSelf) {
      const team = await this.teamRepository.findOne({ where: { id: teamId }, select: ['id', 'name'] });
      if (team) void this.notifications.notifyTeamMemberRemoved({ userId: member.userId, teamName: team.name });
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
    // Only an owner (or platform admin) can change roles.
    await this.assertOwnerAccess(teamId, callerId, callerRoles);

    const member = await this.memberRepository.findOne({
      where: { id: memberId, teamId },
    });
    if (!member) throw new NotFoundException('Member not found in this team');

    if (member.role === dto.role) {
      return { data: this.sanitizeMember(member), message: 'No change' };
    }

    const team = await this.findTeamOrFail(teamId);

    // Promoting to OWNER is a TRANSFER: the promoted member becomes the sole
    // owner; every other current owner is demoted to ADMIN and team.ownerId is
    // repointed. This keeps exactly one owner and the denormalised field in sync.
    if (dto.role === TeamMemberRole.OWNER) {
      await this.dataSource.transaction(async (manager) => {
        const currentOwners = await manager.find(TeamMember, {
          where: { teamId, role: TeamMemberRole.OWNER, isActive: true },
        });
        for (const owner of currentOwners) {
          if (owner.id === member.id) continue;
          owner.role = TeamMemberRole.ADMIN;
          await manager.save(owner);
        }
        member.role = TeamMemberRole.OWNER;
        await manager.save(member);
        await manager.update(Team, { id: teamId }, { ownerId: member.userId });
      });

      await this.grantTeamOwnerRole(member.userId);
      // Demoted previous owners may no longer own any team.
      const previousOwnerIds = (await this.memberRepository.find({
        where: { teamId, role: TeamMemberRole.ADMIN, isActive: true },
      })).map((m) => m.userId);
      await Promise.all(previousOwnerIds.map((id) => this.scrubTeamOwnerRoleIfOrphaned(id)));

      void this.notifications.notifyTeamRoleChanged({ userId: member.userId, teamName: team.name, role: 'owner', isOwner: true });
      return { data: this.sanitizeMember(member), message: 'Ownership transferred' };
    }

    // Demoting an owner to a lower role — never allow removing the last owner.
    if (member.role === TeamMemberRole.OWNER) {
      await this.assertNotLastOwner(teamId, member.userId);
    }

    const wasOwner = member.role === TeamMemberRole.OWNER;
    member.role = dto.role;
    await this.memberRepository.save(member);
    // dto.role is a non-owner role here; scrub the platform role if they just
    // lost their last ownership.
    if (wasOwner) {
      await this.scrubTeamOwnerRoleIfOrphaned(member.userId);
    }

    void this.notifications.notifyTeamRoleChanged({ userId: member.userId, teamName: team.name, role: dto.role, isOwner: false });
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

  /**
   * Member management (add/remove others) is limited to the team OWNER or ADMIN
   * (or a platform ADMIN). A regular MEMBER has no management rights.
   */
  async assertManagerAccess(
    teamId: string,
    userId: string,
    callerRoles: Role[],
  ): Promise<void> {
    if (callerRoles.includes(Role.ADMIN)) return;

    const membership = await this.memberRepository.findOne({
      where: { teamId, userId, isActive: true },
    });

    if (
      !membership ||
      (membership.role !== TeamMemberRole.OWNER && membership.role !== TeamMemberRole.ADMIN)
    ) {
      throw new ForbiddenException('Only a team owner or admin can manage members');
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Recompute the denormalised member_count from the active member rows. */
  private async syncMemberCount(teamId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(TeamMember) : this.memberRepository;
    const teamRepo = manager ? manager.getRepository(Team) : this.teamRepository;
    const count = await repo.count({ where: { teamId, isActive: true } });
    await teamRepo.update({ id: teamId }, { memberCount: count });
  }

  /**
   * After an owner leaves, ensure team.ownerId still points at a real active
   * owner. If none remains (shouldn't happen — last-owner is guarded), promote
   * the earliest-joined admin, else the earliest member, to keep the invariant.
   */
  private async reassignTeamOwnerIfNeeded(teamId: string, leavingUserId: string): Promise<void> {
    const team = await this.teamRepository.findOne({ where: { id: teamId } });
    if (!team || team.ownerId !== leavingUserId) return;

    const nextOwner = await this.memberRepository.findOne({
      where: { teamId, role: TeamMemberRole.OWNER, isActive: true },
      order: { joinedAt: 'ASC' },
    });
    if (nextOwner) {
      team.ownerId = nextOwner.userId;
      await this.teamRepository.save(team);
    }
  }

  /** Grant the platform TEAM_OWNER role if the user doesn't already hold it. */
  private async grantTeamOwnerRole(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user && !user.roles.includes(Role.TEAM_OWNER)) {
      user.roles = [...user.roles, Role.TEAM_OWNER];
      await this.userRepository.save(user);
    }
  }

  /** Remove the TEAM_OWNER role once a user owns no more active teams. */
  private async scrubTeamOwnerRoleIfOrphaned(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.roles.includes(Role.TEAM_OWNER)) return;
    const stillOwner = await this.memberRepository.count({
      where: { userId, role: TeamMemberRole.OWNER, isActive: true },
    });
    if (stillOwner === 0) {
      user.roles = user.roles.filter((r) => r !== Role.TEAM_OWNER);
      await this.userRepository.save(user);
    }
  }

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
