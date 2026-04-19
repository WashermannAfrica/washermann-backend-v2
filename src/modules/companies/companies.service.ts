import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Company } from '../../database/entities/company.entity';
import { Tier } from '../../database/entities/tier.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { CompanyAdmin } from '../../database/entities/company-admin.entity';
import { User } from '../../database/entities/user.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { CompanyStatus } from '../../common/enums/company-status.enum';
import { AssignmentStatus } from '../../common/enums/assignment-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  UpdateCompanyStatusDto,
  AddEmployeeDto,
  ReassignTierDto,
  CreateTierDto,
  UpdateTierDto,
} from './dto';

const INVITE_TOKEN_PREFIX = 'company_invite:';
const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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
    private redisService: RedisService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
  ) {}

  // ─── Companies (Admin-only) ───────────────────────────────────────────────────

  async createCompany(dto: CreateCompanyDto) {
    const company = this.companyRepository.create({
      name: dto.name,
      contactEmail: dto.contactEmail ?? null,
      contactPhone: dto.contactPhone ?? null,
      status: CompanyStatus.ACTIVE,
    });

    await this.companyRepository.save(company);
    this.logger.log(`Company created: ${company.id} — ${company.name}`);

    return { data: company, message: 'Company created successfully' };
  }

  async listCompanies(page = 1, limit = 20) {
    const [companies, total] = await this.companyRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: companies,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  async getCompany(companyId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['tiers'],
    });

    if (!company) throw new NotFoundException('Company not found');

    return { data: company };
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const company = await this.findCompanyOrFail(companyId);

    if (dto.name !== undefined) company.name = dto.name;
    if (dto.contactEmail !== undefined) company.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) company.contactPhone = dto.contactPhone;

    await this.companyRepository.save(company);

    return { data: company, message: 'Company updated' };
  }

  async updateCompanyStatus(companyId: string, dto: UpdateCompanyStatusDto) {
    const company = await this.findCompanyOrFail(companyId);

    company.status = dto.status;
    await this.companyRepository.save(company);

    return { data: company, message: `Company status set to ${dto.status}` };
  }

  // ─── Company-Admin access check ───────────────────────────────────────────────

  /**
   * Asserts that the calling user is an admin of the given company.
   * Admins with Role.ADMIN bypass this check.
   */
  async assertCompanyAccess(companyId: string, userId: string, roles: Role[]) {
    if (roles.includes(Role.ADMIN)) return; // platform admins can access any company

    const membership = await this.adminRepository.findOne({
      where: { companyId, userId },
    });

    if (!membership) {
      throw new ForbiddenException('You do not have admin access to this company');
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
      monthlyPoints: dto.monthlyPoints,
      monthlyOrderLimit: dto.monthlyOrderLimit,
      itemLimit: dto.itemLimit,
    });

    await this.tierRepository.save(tier);

    return { data: tier, message: 'Tier created' };
  }

  async updateTier(companyId: string, tierId: string, dto: UpdateTierDto) {
    const tier = await this.findTierOrFail(companyId, tierId);

    if (dto.name !== undefined) tier.name = dto.name;
    if (dto.monthlyPoints !== undefined) tier.monthlyPoints = dto.monthlyPoints;
    if (dto.monthlyOrderLimit !== undefined) tier.monthlyOrderLimit = dto.monthlyOrderLimit;
    if (dto.itemLimit !== undefined) tier.itemLimit = dto.itemLimit;

    await this.tierRepository.save(tier);

    return { data: tier, message: 'Tier updated' };
  }

  async deleteTier(companyId: string, tierId: string) {
    const tier = await this.findTierOrFail(companyId, tierId);

    // Employees on this tier will have tierId set to NULL (SET NULL FK)
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

    // Validate tier if provided
    if (dto.tierId) {
      await this.findTierOrFail(companyId, dto.tierId);
    }

    // Look up user by email or phone
    const user = await this.userRepository.findOne({
      where: dto.email
        ? { email: dto.email.toLowerCase() }
        : { phone: dto.phone },
    });

    if (user) {
      // ── Existing user ────────────────────────────────────────────────────────
      const existing = await this.employeeRepository.findOne({
        where: { companyId, userId: user.id },
      });

      if (existing) {
        if (existing.assignmentStatus === AssignmentStatus.ACTIVE) {
          throw new ConflictException('User is already an employee of this company');
        }
        // Re-activate a previously deactivated assignment
        existing.assignmentStatus = AssignmentStatus.ACTIVE;
        existing.tierId = dto.tierId ?? null;
        existing.assignedAt = new Date();
        await this.employeeRepository.save(existing);

        this.notifyEmployeeAdded(user, company.name).catch((err) =>
          this.logger.error(`Employee add notification failed: ${err.message}`),
        );

        return { data: this.sanitizeEmployee(existing), message: 'Employee re-activated' };
      }

      // Create fresh assignment
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
      // ── New user — create PENDING account and send invite ────────────────────
      const pendingUser = this.userRepository.create({
        fullName: dto.email
          ? dto.email.split('@')[0]   // temporary name; they'll update on first login
          : 'Invited User',
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

      // Store invite token in Redis
      const inviteToken = uuidv4();
      await this.redisService.setEx(
        `${INVITE_TOKEN_PREFIX}${inviteToken}`,
        INVITE_TTL_SECONDS,
        JSON.stringify({ userId: pendingUser.id, companyId }),
      );

      const deepLinkBase =
        this.configService.get<string>('app.deepLinkBase', 'https://app.washermann.com');

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
          this.logger.error(`Employee invite notification failed: ${err.message}`),
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

  async reassignTier(companyId: string, employeeId: string, dto: ReassignTierDto) {
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
      order: { createdAt: 'ASC' },
    });

    return { data: admins.map((a) => this.sanitizeAdmin(a)) };
  }

  async addAdmin(companyId: string, userId: string) {
    await this.findCompanyOrFail(companyId);

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.adminRepository.findOne({
      where: { companyId, userId },
    });

    if (existing) {
      throw new ConflictException('User is already a company admin');
    }

    const admin = this.adminRepository.create({ companyId, userId });
    await this.adminRepository.save(admin);

    // Grant COMPANY_ADMIN role if not already held
    if (!user.roles.includes(Role.COMPANY_ADMIN)) {
      user.roles = [...user.roles, Role.COMPANY_ADMIN];
      await this.userRepository.save(user);
    }

    return { data: this.sanitizeAdmin(admin), message: 'Admin added' };
  }

  async removeAdmin(companyId: string, userId: string) {
    await this.findCompanyOrFail(companyId);

    const admin = await this.adminRepository.findOne({
      where: { companyId, userId },
    });

    if (!admin) throw new NotFoundException('Admin not found for this company');

    await this.adminRepository.remove(admin);

    // Remove COMPANY_ADMIN role only if they are not an admin of any other company
    const stillAdmin = await this.adminRepository.count({ where: { userId } });
    if (stillAdmin === 0) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        user.roles = user.roles.filter((r) => r !== Role.COMPANY_ADMIN);
        await this.userRepository.save(user);
      }
    }

    return { data: null, message: 'Admin removed' };
  }

  // ─── Employee view (for the employee themselves) ───────────────────────────────

  async getMyCompanies(userId: string) {
    const assignments = await this.employeeRepository.find({
      where: { userId, assignmentStatus: AssignmentStatus.ACTIVE },
      relations: ['company', 'tier'],
      order: { assignedAt: 'DESC' },
    });

    return { data: assignments };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async findCompanyOrFail(companyId: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async findTierOrFail(companyId: string, tierId: string): Promise<Tier> {
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
    if (!assignment) throw new NotFoundException('Employee assignment not found');
    return assignment;
  }

  private async notifyEmployeeAdded(user: User, companyName: string) {
    await this.notificationsService.sendEmployeeInvite({
      fullName: user.fullName,
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      companyName,
      inviteToken: '',        // existing user doesn't need an invite token
      deepLinkBase: this.configService.get<string>('app.deepLinkBase', 'https://app.washermann.com'),
    });
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
