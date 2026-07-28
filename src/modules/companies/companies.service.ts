import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Company } from '../../database/entities/company.entity';
import { Tier } from '../../database/entities/tier.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { CompanyAdmin } from '../../database/entities/company-admin.entity';
import { User } from '../../database/entities/user.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { CompanyWalletService } from './company-wallet.service';
import { UserStatus } from '../../common/enums/user-status.enum';
import { CompanyStatus } from '../../common/enums/company-status.enum';
import { CompanyActivationStatus } from '../../common/enums/company-activation-status.enum';
import { CompanyRole } from '../../common/enums/company-role.enum';
import { AssignmentStatus } from '../../common/enums/assignment-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateCompanyDto,
  ActivateCompanyDto,
  UpdateCompanyDto,
  UpdateCompanyStatusDto,
  GrantAdminDto,
  AddEmployeeDto,
  ReassignTierDto,
  CreateTierDto,
  UpdateTierDto,
} from './dto';

const SALT_ROUNDS = 12;
const COMPANY_INVITE_PREFIX = 'company_invite:';
const COMPANY_INVITE_TTL_SECONDS = 48 * 60 * 60; // 48 hours

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Tier)
    private tierRepository: Repository<Tier>,
    @InjectRepository(CompanyEmployee)
    private employeeRepository: Repository<CompanyEmployee>,
    @InjectRepository(CompanyAdmin)
    private adminRepository: Repository<CompanyAdmin>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(LedgerEntry)
    private ledgerEntryRepository: Repository<LedgerEntry>,
    private redisService: RedisService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
    @Optional() private companyWalletService?: CompanyWalletService,
  ) {}

  // ─── Platform-Admin: create company ──────────────────────────────────────────

  async createCompany(dto: CreateCompanyDto) {
    const ownerEmail = dto.ownerEmail.toLowerCase();

    // Prevent duplicate company invites to the same email
    const emailTaken = await this.companyRepository.findOne({
      where: { ownerEmail },
    });
    if (emailTaken) {
      throw new ConflictException(
        'A company account with this email already exists',
      );
    }

    const company = this.companyRepository.create({
      name: dto.name,
      ownerEmail,
      activationStatus: CompanyActivationStatus.PENDING,
      status: CompanyStatus.ACTIVE,
    });

    await this.companyRepository.save(company);

    // Generate one-time invite token and store in Redis
    // The token payload carries companyId + ownerEmail so activation cannot be
    // redirected to a different email or company.
    const inviteToken = uuidv4();
    await this.redisService.setEx(
      `${COMPANY_INVITE_PREFIX}${inviteToken}`,
      COMPANY_INVITE_TTL_SECONDS,
      JSON.stringify({ companyId: company.id, ownerEmail }),
    );

    // Activation happens in the company WEB portal, not the mobile deep link.
    const companyPortalUrl = this.configService.get<string>(
      'app.companyPortalUrl',
      'http://localhost:3002',
    );

    // Fire and forget — network errors must not block the admin's response
    this.notificationsService
      .sendCompanyInvite({
        companyName: company.name,
        ownerEmail,
        inviteToken,
        deepLinkBase: companyPortalUrl,
      })
      .catch((err) =>
        this.logger.error(`Company invite email failed: ${err.message}`),
      );

    this.logger.log(
      `Company created: ${company.id} — "${company.name}" — invite sent to ${ownerEmail}`,
    );

    return {
      data: { id: company.id, name: company.name, ownerEmail, activationStatus: company.activationStatus },
      message: 'Company created. Activation invite sent to the company email.',
    };
  }

  // ─── Company activation (called by the company owner via the invite link) ─────

  async activateCompany(dto: ActivateCompanyDto) {
    // ── 1. Validate and consume the one-time token ──────────────────────────────
    const redisKey = `${COMPANY_INVITE_PREFIX}${dto.inviteToken}`;
    const raw = await this.redisService.get(redisKey);

    if (!raw) {
      throw new UnauthorizedException(
        'Invalid or expired activation link. Please ask your Washermann account manager to resend.',
      );
    }

    let payload: { companyId: string; ownerEmail: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new UnauthorizedException('Malformed invite token.');
    }

    // Delete immediately — one-time use only; prevents replay attacks
    await this.redisService.del(redisKey);

    const { companyId, ownerEmail } = payload;

    // ── 2. Load the company and guard against re-activation ───────────────────
    const company = await this.findCompanyOrFail(companyId);

    if (company.activationStatus === CompanyActivationStatus.ACTIVE) {
      throw new ConflictException('This company account has already been activated.');
    }

    // ── 3. Check whether a user account already exists for this email ─────────
    //    (handles edge case: someone registered personally with the same email)
    let ownerUser = await this.userRepository.findOne({
      where: { email: ownerEmail },
    });

    if (ownerUser) {
      if (ownerUser.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException(
          'The account associated with this email is suspended.',
        );
      }
      // If account exists (self-registered), just elevate their role
    } else {
      // Create a fresh user account for the company owner

      // Guard: phone must not already belong to another account
      if (dto.phone) {
        const phoneTaken = await this.userRepository.findOne({
          where: { phone: dto.phone },
        });
        if (phoneTaken) {
          throw new ConflictException(
            'This phone number is already associated with another account. Please use a different phone number.',
          );
        }
      }

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

      ownerUser = this.userRepository.create({
        fullName: dto.fullName,
        email: ownerEmail,
        phone: dto.phone,
        passwordHash,
        roles: [Role.USER],
        status: UserStatus.ACTIVE,
        emailVerified: true,   // The activation link itself verified email ownership
        phoneVerified: false,
      });

      await this.userRepository.save(ownerUser);
    }

    // ── 4. Grant COMPANY_OWNER role on the user ───────────────────────────────
    if (!ownerUser.roles.includes(Role.COMPANY_OWNER)) {
      ownerUser.roles = [...ownerUser.roles, Role.COMPANY_OWNER];
      await this.userRepository.save(ownerUser);
    }

    // ── 5. Create the CompanyAdmin record with role = OWNER ───────────────────
    const existingAdmin = await this.adminRepository.findOne({
      where: { companyId, userId: ownerUser.id },
    });

    if (!existingAdmin) {
      const ownerRecord = this.adminRepository.create({
        companyId,
        userId: ownerUser.id,
        companyRole: CompanyRole.OWNER,
      });
      await this.adminRepository.save(ownerRecord);
    } else {
      // Upgrade existing record to owner if needed
      existingAdmin.companyRole = CompanyRole.OWNER;
      await this.adminRepository.save(existingAdmin);
    }

    // ── 6. Update the company profile ────────────────────────────────────────
    company.activationStatus = CompanyActivationStatus.ACTIVE;
    company.phone = dto.phone;
    company.industry = dto.industry;
    company.address = dto.address;
    company.numberOfWorkers = dto.numberOfWorkers;
    company.website = dto.website ?? null;
    company.description = dto.description ?? null;

    await this.companyRepository.save(company);

    this.logger.log(
      `Company activated: ${company.id} — "${company.name}" by user ${ownerUser.id}`,
    );

    return {
      data: { company: this.sanitizeCompany(company), userId: ownerUser.id },
      message: 'Company account activated successfully. You can now log in.',
    };
  }

  // ─── Platform-Admin: list / get / status ─────────────────────────────────────

  async listCompanies(page = 1, limit = 20) {
    const [companies, total] = await this.companyRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: companies.map((c) => this.sanitizeCompany(c)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getCompany(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['tiers'],
    });

    if (!company) throw new NotFoundException('Company not found');

    return { data: this.sanitizeCompany(company) };
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const company = await this.findCompanyOrFail(companyId);

    if (dto.name !== undefined)            company.name = dto.name;
    if (dto.phone !== undefined)           company.phone = dto.phone ?? null;
    if (dto.industry !== undefined)        company.industry = dto.industry ?? null;
    if (dto.address !== undefined)         company.address = dto.address ?? null;
    if (dto.website !== undefined)         company.website = dto.website ?? null;
    if (dto.numberOfWorkers !== undefined) company.numberOfWorkers = dto.numberOfWorkers ?? null;
    if (dto.description !== undefined)     company.description = dto.description ?? null;

    await this.companyRepository.save(company);

    return { data: this.sanitizeCompany(company), message: 'Company updated' };
  }

  async updateCompanyStatus(companyId: string, dto: UpdateCompanyStatusDto) {
    const company = await this.findCompanyOrFail(companyId);

    company.status = dto.status;
    await this.companyRepository.save(company);

    // Freeze/unfreeze the company wallet on status change
    if (this.companyWalletService) {
      if (dto.status === CompanyStatus.INACTIVE) {
        await this.companyWalletService.freezeWallet(companyId).catch((err) =>
          this.logger.error(`Wallet freeze failed for company ${companyId}: ${err.message}`),
        );
      } else if (dto.status === CompanyStatus.ACTIVE) {
        await this.companyWalletService.unfreezeWallet(companyId).catch((err) =>
          this.logger.error(`Wallet unfreeze failed for company ${companyId}: ${err.message}`),
        );
      }
    }

    return {
      data: this.sanitizeCompany(company),
      message: `Company status set to ${dto.status}`,
    };
  }

  // ─── Multi-company dashboard: list all companies the user can admin ───────────

  async getAdminCompanies(userId: string) {
    const records = await this.adminRepository.find({
      where: { userId },
      relations: ['company'],
      order: { createdAt: 'ASC' },
    });

    return {
      data: records
        .filter((r) => r.company)
        .map((r) => ({
          companyId: r.companyId,
          companyRole: r.companyRole,
          company: this.sanitizeCompany(r.company),
        })),
    };
  }

  // ─── Company-admin access check ───────────────────────────────────────────────

  /**
   * Asserts that the calling user is an admin (OWNER or ADMIN) of the company.
   * Platform admins (Role.ADMIN) bypass this check — they can access any company.
   */
  async assertCompanyAccess(companyId: string, userId: string, roles: Role[]) {
    if (roles.includes(Role.ADMIN)) return; // Platform admin bypass

    const membership = await this.adminRepository.findOne({
      where: { companyId, userId },
    });

    if (!membership) {
      throw new ForbiddenException(
        'You do not have admin access to this company',
      );
    }
  }

  /**
   * Asserts that the caller holds OWNER role in the company.
   * Used for operations restricted to the company owner: granting OWNER role.
   */
  async assertOwnerAccess(companyId: string, userId: string, roles: Role[]) {
    if (roles.includes(Role.ADMIN)) return; // Platform admin bypass

    const membership = await this.adminRepository.findOne({
      where: { companyId, userId },
    });

    if (!membership || membership.companyRole !== CompanyRole.OWNER) {
      throw new ForbiddenException(
        'Only the company owner can perform this action',
      );
    }
  }

  // ─── Tiers ───────────────────────────────────────────────────────────────────

  async listTiers(companyId: string) {
    await this.findCompanyOrFail(companyId);

    const tiers = await this.tierRepository.find({
      where: { companyId },
      order: { createdAt: 'ASC' },
    });

    return { data: tiers };
  }

  async createTier(companyId: string, dto: CreateTierDto) {
    await this.findCompanyOrFail(companyId);

    const tier = this.tierRepository.create({
      companyId,
      name: dto.name,
      pointsPerCycle: dto.pointsPerCycle,
      monthlyOrderLimit: dto.monthlyOrderLimit ?? 0,
      itemLimit: dto.itemLimit ?? 0,
      intervalCount: dto.intervalCount ?? 1,
      duration: dto.duration,
      spendingCapPerCycle: dto.spendingCapPerCycle ?? 0,
    });

    await this.tierRepository.save(tier);

    return { data: tier, message: 'Tier created' };
  }

  async updateTier(companyId: string, tierId: string, dto: UpdateTierDto) {
    const tier = await this.findTierOrFail(companyId, tierId);

    // Check if any employees are currently assigned to this tier
    const activeEmployeeCount = await this.employeeRepository.count({
      where: { tierId, assignmentStatus: AssignmentStatus.ACTIVE },
    });

    if (activeEmployeeCount === 0) {
      // No active employees — apply changes immediately
      if (dto.name !== undefined)               tier.name = dto.name;
      if (dto.pointsPerCycle !== undefined)     tier.pointsPerCycle = dto.pointsPerCycle;
      if (dto.monthlyOrderLimit !== undefined)  tier.monthlyOrderLimit = dto.monthlyOrderLimit;
      if (dto.itemLimit !== undefined)          tier.itemLimit = dto.itemLimit;
      if (dto.intervalCount !== undefined)      tier.intervalCount = dto.intervalCount;
      if (dto.duration !== undefined)           tier.duration = dto.duration;
      if (dto.spendingCapPerCycle !== undefined) tier.spendingCapPerCycle = dto.spendingCapPerCycle;

      await this.tierRepository.save(tier);

      return { data: tier, message: 'Tier updated' };
    }

    // Active employees exist — stage changes for next cycle
    const pendingChanges: Record<string, any> = {};
    if (dto.name !== undefined)               pendingChanges.name = dto.name;
    if (dto.pointsPerCycle !== undefined)     pendingChanges.pointsPerCycle = dto.pointsPerCycle;
    if (dto.monthlyOrderLimit !== undefined)  pendingChanges.monthlyOrderLimit = dto.monthlyOrderLimit;
    if (dto.itemLimit !== undefined)          pendingChanges.itemLimit = dto.itemLimit;
    if (dto.intervalCount !== undefined)      pendingChanges.intervalCount = dto.intervalCount;
    if (dto.duration !== undefined)           pendingChanges.duration = dto.duration;
    if (dto.spendingCapPerCycle !== undefined) pendingChanges.spendingCapPerCycle = dto.spendingCapPerCycle;

    tier.pendingChanges = pendingChanges;

    // Set effective from: start of next cycle (next month first day for monthly, etc.)
    const now = new Date();
    const nextCycleStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    tier.pendingEffectiveFrom = nextCycleStart;

    await this.tierRepository.save(tier);

    return {
      data: tier,
      message: 'Tier changes will take effect at the start of the next allocation cycle.',
    };
  }

  async deleteTier(companyId: string, tierId: string) {
    const tier = await this.findTierOrFail(companyId, tierId);

    await this.tierRepository.remove(tier);

    return { data: null, message: 'Tier deleted' };
  }

  // ─── Employees ───────────────────────────────────────────────────────────────

  async listEmployees(companyId: string, page = 1, limit = 20) {
    await this.findCompanyOrFail(companyId);

    const [employees, total] = await this.employeeRepository.findAndCount({
      where: { companyId },
      relations: ['user', 'tier'],
      skip: (page - 1) * limit,
      take: limit,
      order: { assignedAt: 'DESC' },
    });

    return {
      data: employees.map((e) => this.sanitizeEmployee(e)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async addEmployee(companyId: string, dto: AddEmployeeDto) {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Email or phone is required');
    }

    const company = await this.findCompanyOrFail(companyId);

    if (company.activationStatus !== CompanyActivationStatus.ACTIVE) {
      throw new BadRequestException(
        'Company is not yet activated. Cannot add employees.',
      );
    }

    if (dto.tierId) {
      await this.findTierOrFail(companyId, dto.tierId);
    }

    const user = await this.userRepository.findOne({
      where: dto.email
        ? { email: dto.email.toLowerCase() }
        : { phone: dto.phone },
    });

    if (user) {
      const existing = await this.employeeRepository.findOne({
        where: { companyId, userId: user.id },
      });

      if (existing) {
        if (existing.assignmentStatus === AssignmentStatus.ACTIVE) {
          throw new ConflictException(
            'User is already an employee of this company',
          );
        }
        // Re-activate
        existing.assignmentStatus = AssignmentStatus.ACTIVE;
        existing.tierId = dto.tierId ?? null;
        existing.assignedAt = new Date();
        await this.employeeRepository.save(existing);

        this.notifyEmployeeAdded(user, company.name).catch((err) =>
          this.logger.error(`Employee add notification failed: ${err.message}`),
        );

        return {
          data: this.sanitizeEmployee(existing),
          message: 'Employee re-activated',
        };
      }

      const assignment = this.employeeRepository.create({
        companyId,
        userId: user.id,
        tierId: dto.tierId ?? null,
        assignmentStatus: AssignmentStatus.ACTIVE,
        assignedAt: new Date(),
      });

      await this.employeeRepository.save(assignment);

      this.notifyEmployeeAdded(user, company.name).catch((err) =>
        this.logger.error(`Employee add notification failed: ${err.message}`),
      );

      return { data: this.sanitizeEmployee(assignment), message: 'Employee added' };
    } else {
      // New user — create PENDING account and send invite
      const pendingUser = this.userRepository.create({
        fullName: dto.email ? dto.email.split('@')[0] : 'Invited User',
        email: dto.email ? dto.email.toLowerCase() : null,
        phone: dto.phone ?? null,
        roles: [Role.USER],
        status: UserStatus.PENDING,
        emailVerified: false,
        phoneVerified: false,
      });

      await this.userRepository.save(pendingUser);

      const assignment = this.employeeRepository.create({
        companyId,
        userId: pendingUser.id,
        tierId: dto.tierId ?? null,
        assignmentStatus: AssignmentStatus.ACTIVE,
        assignedAt: new Date(),
      });

      await this.employeeRepository.save(assignment);

      const inviteToken = uuidv4();
      await this.redisService.setEx(
        `company_invite:${inviteToken}`,
        7 * 24 * 60 * 60, // 7 days
        JSON.stringify({ userId: pendingUser.id, companyId }),
      );

      const deepLinkBase = this.configService.get<string>(
        'app.deepLinkBase',
        'https://app.washermann.com',
      );

      this.notificationsService
        .sendEmployeeInvite({
          fullName: pendingUser.fullName,
          email: pendingUser.email ?? undefined,
          phone: pendingUser.phone ?? undefined,
          companyName: company.name,
          inviteToken,
          deepLinkBase,
        })
        .catch((err) =>
          this.logger.error(`Employee invite failed: ${err.message}`),
        );

      return {
        data: this.sanitizeEmployee(assignment),
        message: 'Invite sent to new user',
      };
    }
  }

  async removeEmployee(companyId: string, employeeId: string) {
    const assignment = await this.findAssignmentOrFail(companyId, employeeId);

    assignment.assignmentStatus = AssignmentStatus.INACTIVE;
    await this.employeeRepository.save(assignment);

    return { data: null, message: 'Employee removed from company' };
  }

  async reassignTier(
    companyId: string,
    employeeId: string,
    dto: ReassignTierDto,
  ) {
    const assignment = await this.findAssignmentOrFail(companyId, employeeId);

    if (dto.tierId) {
      await this.findTierOrFail(companyId, dto.tierId);
    }

    assignment.tierId = dto.tierId;
    await this.employeeRepository.save(assignment);

    return { data: assignment, message: 'Tier updated for employee' };
  }

  // ─── Company Admins ───────────────────────────────────────────────────────────

  async listAdmins(companyId: string) {
    await this.findCompanyOrFail(companyId);

    const admins = await this.adminRepository.find({
      where: { companyId },
      relations: ['user'],
      order: { companyRole: 'ASC', createdAt: 'ASC' }, // owners first
    });

    return { data: admins.map((a) => this.sanitizeAdmin(a)) };
  }

  /**
   * Grant admin or owner access to a user for this company.
   *
   * Security rules enforced here:
   *  - Only COMPANY_OWNER (or platform ADMIN) may grant OWNER role.
   *  - COMPANY_ADMIN cannot grant OWNER — not even to themselves.
   *  - Cannot add a second OWNER without demoting the first (ownership transfer).
   */
  async addAdmin(
    companyId: string,
    targetUserId: string,
    dto: GrantAdminDto,
    callerId: string,
    callerRoles: Role[],
  ) {
    await this.findCompanyOrFail(companyId);

    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('User not found');

    // ── Role escalation prevention ────────────────────────────────────────────
    if (dto.companyRole === CompanyRole.OWNER) {
      await this.assertOwnerAccess(companyId, callerId, callerRoles);
    }

    const existing = await this.adminRepository.findOne({
      where: { companyId, userId: targetUserId },
    });

    if (existing) {
      if (existing.companyRole === CompanyRole.OWNER && dto.companyRole === CompanyRole.ADMIN) {
        // Downgrading an owner: verify no orphan risk
        await this.assertNotLastOwner(companyId, targetUserId);
        existing.companyRole = CompanyRole.ADMIN;

        // Remove COMPANY_OWNER JWT role if they're not owner anywhere else
        const stillOwner = await this.adminRepository.count({
          where: { userId: targetUserId, companyRole: CompanyRole.OWNER },
        });
        if (stillOwner === 0 && target.roles.includes(Role.COMPANY_OWNER)) {
          target.roles = target.roles.filter((r) => r !== Role.COMPANY_OWNER);
          await this.userRepository.save(target);
        }
      } else {
        existing.companyRole = dto.companyRole;
      }
      await this.adminRepository.save(existing);
      return { data: this.sanitizeAdmin(existing), message: 'Admin role updated' };
    }

    const admin = this.adminRepository.create({
      companyId,
      userId: targetUserId,
      companyRole: dto.companyRole,
    });
    await this.adminRepository.save(admin);

    // Sync JWT role
    const newRole =
      dto.companyRole === CompanyRole.OWNER ? Role.COMPANY_OWNER : Role.COMPANY_ADMIN;

    if (!target.roles.includes(newRole)) {
      target.roles = [...target.roles, newRole];
      await this.userRepository.save(target);
    }

    return { data: this.sanitizeAdmin(admin), message: 'Admin added' };
  }

  async removeAdmin(
    companyId: string,
    targetUserId: string,
    callerId: string,
    callerRoles: Role[],
  ) {
    await this.findCompanyOrFail(companyId);

    const record = await this.adminRepository.findOne({
      where: { companyId, userId: targetUserId },
    });
    if (!record) throw new NotFoundException('Admin not found for this company');

    // ── Owner removal protection ───────────────────────────────────────────────
    if (record.companyRole === CompanyRole.OWNER) {
      // Only another OWNER or platform ADMIN can remove an OWNER
      await this.assertOwnerAccess(companyId, callerId, callerRoles);
      // Cannot remove the last owner — company would be unmanageable
      await this.assertNotLastOwner(companyId, targetUserId);
    }

    await this.adminRepository.remove(record);

    // Scrub JWT roles if no remaining memberships
    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (target) {
      const stillOwner = await this.adminRepository.count({
        where: { userId: targetUserId, companyRole: CompanyRole.OWNER },
      });
      const stillAdmin = await this.adminRepository.count({
        where: { userId: targetUserId },
      });

      let roles = [...target.roles];
      if (stillOwner === 0) roles = roles.filter((r) => r !== Role.COMPANY_OWNER);
      if (stillAdmin === 0) roles = roles.filter((r) => r !== Role.COMPANY_ADMIN);
      target.roles = roles;
      await this.userRepository.save(target);
    }

    return { data: null, message: 'Admin removed' };
  }

  // ─── Employee Transactions ────────────────────────────────────────────────────

  async getEmployeeTransactions(
    companyId: string,
    employeeId: string,
    page = 1,
    limit = 20,
  ) {
    const assignment = await this.findAssignmentOrFail(companyId, employeeId);

    const [entries, total] = await this.ledgerEntryRepository.findAndCount({
      where: [
        { userId: assignment.userId, source: LedgerSource.BENEFIT_CREDIT },
        { userId: assignment.userId, source: LedgerSource.BENEFIT_EXPIRY },
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: entries,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Employee self-view ───────────────────────────────────────────────────────

  async getMyCompanies(userId: string) {
    const assignments = await this.employeeRepository.find({
      where: { userId, assignmentStatus: AssignmentStatus.ACTIVE },
      relations: ['company', 'tier'],
      order: { assignedAt: 'DESC' },
    });

    return { data: assignments };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async assertNotLastOwner(
    companyId: string,
    userId: string,
  ): Promise<void> {
    const ownerCount = await this.adminRepository.count({
      where: { companyId, companyRole: CompanyRole.OWNER },
    });
    if (ownerCount <= 1) {
      throw new BadRequestException(
        'Cannot remove or demote the last owner. Transfer ownership first.',
      );
    }
  }

  private async findCompanyOrFail(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async findTierOrFail(
    companyId: string,
    tierId: string,
  ): Promise<Tier> {
    const tier = await this.tierRepository.findOne({
      where: { id: tierId, companyId },
    });
    if (!tier) throw new NotFoundException('Tier not found in this company');
    return tier;
  }

  private async findAssignmentOrFail(
    companyId: string,
    employeeId: string,
  ): Promise<CompanyEmployee> {
    const assignment = await this.employeeRepository.findOne({
      where: { id: employeeId, companyId },
    });
    if (!assignment)
      throw new NotFoundException('Employee assignment not found');
    return assignment;
  }

  private async notifyEmployeeAdded(user: User, companyName: string) {
    await this.notificationsService.sendEmployeeInvite({
      fullName: user.fullName,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      companyName,
      inviteToken: '',
      deepLinkBase: this.configService.get<string>(
        'app.deepLinkBase',
        'https://app.washermann.com',
      ),
    });
  }

  private sanitizeCompany(c: Company) {
    return {
      id: c.id,
      name: c.name,
      ownerEmail: c.ownerEmail,
      activationStatus: c.activationStatus,
      status: c.status,
      phone: c.phone,
      industry: c.industry,
      address: c.address,
      website: c.website,
      numberOfWorkers: c.numberOfWorkers,
      description: c.description,
      tiers: c.tiers,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  private sanitizeEmployee(e: CompanyEmployee) {
    return {
      id: e.id,
      companyId: e.companyId,
      userId: e.userId,
      tierId: e.tierId,
      assignmentStatus: e.assignmentStatus,
      assignedAt: e.assignedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      user: e.user
        ? {
            id: e.user.id,
            fullName: e.user.fullName,
            email: e.user.email,
            phone: e.user.phone,
            status: e.user.status,
          }
        : undefined,
      tier: e.tier ?? undefined,
    };
  }

  private sanitizeAdmin(a: CompanyAdmin) {
    return {
      id: a.id,
      companyId: a.companyId,
      userId: a.userId,
      companyRole: a.companyRole,
      createdAt: a.createdAt,
      user: a.user
        ? {
            id: a.user.id,
            fullName: a.user.fullName,
            email: a.user.email,
            phone: a.user.phone,
          }
        : undefined,
    };
  }
}
