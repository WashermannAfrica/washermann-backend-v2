import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../common/enums/roles.enum';
import { UserStatus } from '../../common/enums/user-status.enum';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';

const STAFF_ROLES = [Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE];
const INVITE_TOKEN_PREFIX = 'invite:'; // Must match auth.service.ts INVITE_TOKEN_PREFIX
const INVITE_TTL = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  // ─── Invite staff ─────────────────────────────────────────────────────────────

  async inviteStaff(dto: InviteStaffDto, invitedBy: string): Promise<{ data: object; message: string }> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      const hasStaffRole = existing.roles.some((r) => STAFF_ROLES.includes(r as Role));
      if (hasStaffRole) {
        throw new ConflictException('This email is already associated with a staff account');
      }
      throw new BadRequestException(
        'A user account already exists with this email. Use the role update endpoint to assign a staff role.',
      );
    }

    const user = this.userRepo.create({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      phone: null,
      passwordHash: null,
      roles: [dto.role],
      status: UserStatus.PENDING,
      emailVerified: false,
      phoneVerified: false,
    });

    await this.userRepo.save(user);

    // Generate invite token, store in Redis with user ID
    const token = uuidv4();
    await this.redisService.setEx(`${INVITE_TOKEN_PREFIX}${token}`, INVITE_TTL, user.id);

    const deepLinkBase = this.configService.get<string>('app.deepLinkBase') || this.configService.get<string>('app.frontendUrl') || 'https://app.washermann.com';

    await this.notificationsService.sendStaffInvite({
      fullName: dto.fullName,
      email: dto.email.toLowerCase(),
      role: dto.role,
      inviteToken: token,
      deepLinkBase,
    });

    this.logger.log(`Staff invite sent: ${user.id} | ${dto.email} | role=${dto.role} | invitedBy=${invitedBy}`);

    return {
      data: this.sanitizeStaff(user),
      message: `Staff invitation sent to ${dto.email}`,
    };
  }

  // ─── List staff ───────────────────────────────────────────────────────────────

  async listStaff(page: number, limit: number): Promise<{ data: object[]; meta: object }> {
    const [users, total] = await this.userRepo
      .createQueryBuilder('user')
      // roles is a simple-array (comma-separated text); split then overlap so we
      // match whole roles exactly (avoids 'admin' matching 'company_admin').
      .where(`string_to_array(user.roles, ',') && ARRAY[:...roles]::text[]`, { roles: STAFF_ROLES })
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: users.map((u) => this.sanitizeStaff(u)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Get staff member ─────────────────────────────────────────────────────────

  async getStaff(userId: string): Promise<{ data: object }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Staff member not found');

    const hasStaffRole = user.roles.some((r) => STAFF_ROLES.includes(r as Role));
    if (!hasStaffRole) throw new NotFoundException('Staff member not found');

    return { data: this.sanitizeStaff(user) };
  }

  // ─── Update staff role ────────────────────────────────────────────────────────

  async updateStaffRole(
    targetUserId: string,
    dto: UpdateStaffRoleDto,
    callerId: string,
  ): Promise<{ data: object; message: string }> {
    const user = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Staff member not found');

    const hasStaffRole = user.roles.some((r) => STAFF_ROLES.includes(r as Role));
    if (!hasStaffRole) {
      throw new BadRequestException('Target user does not have a staff role');
    }

    // Cannot change own role
    if (targetUserId === callerId) {
      throw new BadRequestException('You cannot change your own staff role');
    }

    // Protect against removing last ADMIN
    const currentStaffRole = user.roles.find((r) => STAFF_ROLES.includes(r as Role));
    if (currentStaffRole === Role.ADMIN && dto.role !== Role.ADMIN) {
      const adminCount = await this.userRepo
        .createQueryBuilder('user')
        .where(`user.roles LIKE :role`, { role: `%${Role.ADMIN}%` })
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot change the role of the last admin. Create another admin first.',
        );
      }
    }

    // Replace old staff role, keep non-staff roles (e.g. 'user')
    const nonStaffRoles = user.roles.filter((r) => !STAFF_ROLES.includes(r as Role));
    user.roles = [...new Set([...nonStaffRoles, dto.role])];

    await this.userRepo.save(user);

    this.logger.log(`Staff role updated: user=${targetUserId} | oldRole=${currentStaffRole} | newRole=${dto.role} | by=${callerId}`);

    return {
      data: this.sanitizeStaff(user),
      message: `Staff role updated to ${dto.role}`,
    };
  }

  // ─── Deactivate staff ─────────────────────────────────────────────────────────

  async deactivateStaff(targetUserId: string, callerId: string): Promise<{ data: null; message: string }> {
    if (targetUserId === callerId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    const user = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Staff member not found');

    const hasStaffRole = user.roles.some((r) => STAFF_ROLES.includes(r as Role));
    if (!hasStaffRole) {
      throw new BadRequestException('Target user does not have a staff role');
    }

    // Protect against deactivating last ADMIN
    if (user.roles.includes(Role.ADMIN)) {
      const adminCount = await this.userRepo
        .createQueryBuilder('user')
        .where(`user.roles LIKE :role`, { role: `%${Role.ADMIN}%` })
        .andWhere('user.status != :status', { status: UserStatus.DEACTIVATED })
        .getCount();

      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot deactivate the last active admin. Create another admin first.',
        );
      }
    }

    user.status = UserStatus.DEACTIVATED;
    await this.userRepo.save(user);

    this.logger.log(`Staff deactivated: user=${targetUserId} | by=${callerId}`);

    return { data: null, message: 'Staff member deactivated successfully' };
  }

  // ─── Private: sanitize ────────────────────────────────────────────────────────

  private sanitizeStaff(user: User): object {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      roles: user.roles,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
