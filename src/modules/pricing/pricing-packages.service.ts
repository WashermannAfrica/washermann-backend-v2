import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PricingPackage, PackageAudience } from '../../database/entities/pricing-package.entity';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import {
  CreatePricingPackageDto,
  UpdatePricingPackageDto,
} from './dto/pricing-package.dto';

// ─── Audience context ─────────────────────────────────────────────────────────

/** Lazily-populated snapshot of a user's relevant attributes for audience matching */
interface AudienceContext {
  user: User;
  addressCount: number;
  completedOrderCount: number;
  mostRecentCompletedOrderAt: Date | null;
  orderAreaIds: string[];         // distinct areaIds from completed orders
  companyIds: string[];           // company IDs user belongs to
}

@Injectable()
export class PricingPackagesService {
  constructor(
    @InjectRepository(PricingPackage)
    private packageRepository: Repository<PricingPackage>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(Address)
    private addressRepository: Repository<Address>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(CompanyEmployee)
    private companyEmployeeRepository: Repository<CompanyEmployee>,
  ) {}

  // ─── Admin CRUD ───────────────────────────────────────────────────────────────

  async create(dto: CreatePricingPackageDto, adminId: string): Promise<PricingPackage> {
    if (dto.validFrom && dto.validUntil && new Date(dto.validFrom) >= new Date(dto.validUntil)) {
      throw new BadRequestException('validFrom must be before validUntil');
    }

    const pkg = this.packageRepository.create({
      name:           dto.name,
      description:    dto.description   ?? null,
      imageUrl:       dto.imageUrl      ?? null,
      priceWP:        dto.priceWP,
      criteria:       dto.criteria      ?? [],
      audience:       dto.audience      ?? { allUsers: true },
      isActive:       dto.isActive      ?? true,
      displayOrder:   dto.displayOrder  ?? 100,
      validFrom:      dto.validFrom     ? new Date(dto.validFrom)    : null,
      validUntil:     dto.validUntil    ? new Date(dto.validUntil)   : null,
      maxUsesPerUser: dto.maxUsesPerUser ?? null,
      createdBy:      adminId,
      updatedBy:      adminId,
    });

    return this.packageRepository.save(pkg);
  }

  async findAll(): Promise<PricingPackage[]> {
    return this.packageRepository.find({ order: { displayOrder: 'ASC', createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<PricingPackage> {
    const pkg = await this.packageRepository.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Pricing package not found');
    return pkg;
  }

  async update(id: string, dto: UpdatePricingPackageDto, adminId: string): Promise<PricingPackage> {
    const pkg = await this.findOne(id);

    if (dto.validFrom !== undefined) pkg.validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    if (dto.validUntil !== undefined) pkg.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    if (pkg.validFrom && pkg.validUntil && pkg.validFrom >= pkg.validUntil) {
      throw new BadRequestException('validFrom must be before validUntil');
    }

    if (dto.name           !== undefined) pkg.name           = dto.name;
    if (dto.description    !== undefined) pkg.description    = dto.description ?? null;
    if (dto.imageUrl       !== undefined) pkg.imageUrl       = dto.imageUrl    ?? null;
    if (dto.priceWP        !== undefined) pkg.priceWP        = dto.priceWP;
    if (dto.criteria       !== undefined) pkg.criteria       = dto.criteria;
    if (dto.audience       !== undefined) pkg.audience       = dto.audience;
    if (dto.isActive       !== undefined) pkg.isActive       = dto.isActive;
    if (dto.displayOrder   !== undefined) pkg.displayOrder   = dto.displayOrder;
    if (dto.maxUsesPerUser !== undefined) pkg.maxUsesPerUser = dto.maxUsesPerUser ?? null;

    pkg.updatedBy = adminId;
    return this.packageRepository.save(pkg);
  }

  async remove(id: string): Promise<void> {
    const pkg = await this.findOne(id);
    await this.packageRepository.remove(pkg);
  }

  // ─── Customer: list available packages (audience-filtered) ────────────────────

  /**
   * Returns packages that are:
   *  1. Active (`isActive = true`)
   *  2. Within their validity window (if set)
   *  3. Eligible for the requesting user (audience rules)
   *
   * Packages with `audience.allUsers = true` skip detailed rule checks.
   */
  async findForUser(userId: string): Promise<PricingPackage[]> {
    const now = new Date();

    // Load all active, non-expired packages
    const candidates = await this.packageRepository
      .createQueryBuilder('pkg')
      .where('pkg.isActive = true')
      .andWhere('(pkg.validFrom IS NULL OR pkg.validFrom <= :now)', { now })
      .andWhere('(pkg.validUntil IS NULL OR pkg.validUntil >= :now)', { now })
      .orderBy('pkg.displayOrder', 'ASC')
      .addOrderBy('pkg.createdAt', 'DESC')
      .getMany();

    if (candidates.length === 0) return [];

    // Check whether any package needs detailed audience evaluation
    const needsContext = candidates.some(p => !p.audience?.allUsers);
    const ctx = needsContext ? await this.buildAudienceContext(userId) : null;

    return candidates.filter(pkg => this.matchesAudience(pkg.audience, ctx));
  }

  // ─── Audience evaluation ─────────────────────────────────────────────────────

  private matchesAudience(audience: PackageAudience, ctx: AudienceContext | null): boolean {
    // allUsers flag bypasses all other checks
    if (audience?.allUsers) return true;

    // No context means we could not build it (e.g. user not found) — deny
    if (!ctx) return false;

    const { user, addressCount, completedOrderCount, mostRecentCompletedOrderAt, orderAreaIds, companyIds } = ctx;

    // roles — user must have at least one matching role
    if (audience.roles && audience.roles.length > 0) {
      const hasRole = audience.roles.some(r => user.roles?.includes(r));
      if (!hasRole) return false;
    }

    // requirePhone
    if (audience.requirePhone && (!user.phone || user.phone.trim().length === 0)) {
      return false;
    }

    // requireAddress
    if (audience.requireAddress && addressCount === 0) {
      return false;
    }

    // minOrderCount — completed orders only
    if (audience.minOrderCount != null && completedOrderCount < audience.minOrderCount) {
      return false;
    }

    // activeWithinDays — must have completed an order within N days
    if (audience.activeWithinDays != null) {
      if (!mostRecentCompletedOrderAt) return false;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - audience.activeWithinDays);
      if (mostRecentCompletedOrderAt < cutoff) return false;
    }

    // areaIds — user must have placed at least one order in one of the specified areas
    if (audience.areaIds && audience.areaIds.length > 0) {
      const overlaps = orderAreaIds.some(id => audience.areaIds!.includes(id));
      if (!overlaps) return false;
    }

    // companyIds — user must belong to at least one of the specified companies
    if (audience.companyIds && audience.companyIds.length > 0) {
      const overlaps = companyIds.some(id => audience.companyIds!.includes(id));
      if (!overlaps) return false;
    }

    return true;
  }

  private async buildAudienceContext(userId: string): Promise<AudienceContext | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return null;

    const completedStatuses: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.DELIVERED];

    const [addressCount, completedOrders, companyMemberships] = await Promise.all([
      this.addressRepository.count({ where: { userId } }),
      this.orderRepository.find({
        where: { customerId: userId, status: In(completedStatuses) },
        select: ['id', 'areaId', 'createdAt'],
        order: { createdAt: 'DESC' },
      }),
      this.companyEmployeeRepository.find({
        where: { userId },
        select: ['companyId'],
      }),
    ]);

    const completedOrderCount            = completedOrders.length;
    const mostRecentCompletedOrderAt     = completedOrders.length > 0
      ? completedOrders[0].createdAt
      : null;
    const orderAreaIds                   = [...new Set(completedOrders.map(o => o.areaId))];
    const companyIds                     = companyMemberships.map(m => m.companyId);

    return {
      user,
      addressCount,
      completedOrderCount,
      mostRecentCompletedOrderAt,
      orderAreaIds,
      companyIds,
    };
  }
}
