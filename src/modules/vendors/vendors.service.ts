import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, ILike, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorDocument } from '../../database/entities/vendor-document.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { VendorEarningsWallet } from '../../database/entities/vendor-earnings-wallet.entity';
import { VendorLedgerEntry } from '../../database/entities/vendor-ledger-entry.entity';
import { User } from '../../database/entities/user.entity';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ProposePricingDto } from './dto/propose-pricing.dto';
import { ApprovePricingDto, RejectPricingDto } from './dto/approve-pricing.dto';
import { VerifyVendorDto } from './dto/verify-vendor.dto';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';

@Injectable()
export class VendorsService {
  constructor(
    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,

    @InjectRepository(VendorDocument)
    private documentRepository: Repository<VendorDocument>,

    @InjectRepository(VendorPricing)
    private pricingRepository: Repository<VendorPricing>,

    @InjectRepository(VendorEarningsWallet)
    private walletRepository: Repository<VendorEarningsWallet>,

    @InjectRepository(VendorLedgerEntry)
    private ledgerRepository: Repository<VendorLedgerEntry>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  // ─── Admin: Create vendor (new user + vendor record + wallet) ─────────────────

  async adminCreate(dto: RegisterVendorDto, adminId: string) {
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email.toLowerCase() }, { phone: dto.phone }],
    });
    if (existing) {
      throw new ConflictException('A user with this email or phone already exists');
    }

    return this.dataSource.transaction(async (manager) => {
      // Create user account
      const tempPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const user = manager.create(User, {
        fullName: dto.fullName.trim(),
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone.trim(),
        passwordHash,
        roles: [Role.VENDOR],
        emailVerified: false,
      });
      await manager.save(user);

      // Create vendor record
      const vendor = manager.create(Vendor, {
        userId: user.id,
        businessName: dto.businessName.trim(),
        phone: dto.phone.trim(),
        areaIds: dto.areaIds ?? [],
        verificationStatus: VendorVerificationStatus.PENDING_REVIEW,
        isAvailable: false,
      });
      await manager.save(vendor);

      // Create earnings wallet
      const wallet = manager.create(VendorEarningsWallet, {
        vendorId: vendor.id,
        balance: 0,
        totalEarned: 0,
        status: 'active',
      });
      await manager.save(wallet);

      return { vendor, user: this.sanitizeUser(user) };
    });
  }

  // ─── List vendors (admin) ─────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    verificationStatus?: VendorVerificationStatus;
    isAvailable?: boolean;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.vendorRepository
      .createQueryBuilder('v')
      .leftJoin('v.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.email', 'u.phone'])
      .orderBy('v.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.verificationStatus) {
      qb.andWhere('v.verificationStatus = :vs', { vs: query.verificationStatus });
    }
    if (query.isAvailable != null) {
      qb.andWhere('v.isAvailable = :avail', { avail: query.isAvailable });
    }
    if (query.search) {
      qb.andWhere(
        '(v.businessName ILIKE :q OR u.email ILIKE :q OR u.fullName ILIKE :q)',
        { q: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Get one vendor ──────────────────────────────────────────────────────────

  async findOne(id: string) {
    const vendor = await this.vendorRepository
      .createQueryBuilder('v')
      .leftJoin('v.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.email', 'u.phone'])
      .where('v.id = :id', { id })
      .getOne();
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  /** Find vendor record by userId */
  async findByUserId(userId: string) {
    const vendor = await this.vendorRepository.findOne({ where: { userId } });
    if (!vendor) throw new NotFoundException('Vendor profile not found');
    return vendor;
  }

  // ─── Update vendor profile ───────────────────────────────────────────────────

  async update(vendorId: string, dto: UpdateVendorDto) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (dto.businessName != null) vendor.businessName = dto.businessName.trim();
    if (dto.phone        != null) vendor.phone        = dto.phone.trim();
    if (dto.areaIds      != null) vendor.areaIds      = dto.areaIds;
    if (dto.isAvailable  != null) {
      // Only verified vendors can toggle available
      if (dto.isAvailable && vendor.verificationStatus !== VendorVerificationStatus.VERIFIED) {
        throw new ForbiddenException('Only verified vendors can set themselves as available');
      }
      vendor.isAvailable = dto.isAvailable;
    }

    return this.vendorRepository.save(vendor);
  }

  // ─── Admin: Verify / reject vendor ──────────────────────────────────────────

  async verify(vendorId: string, dto: VerifyVendorDto, adminId: string) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (dto.decision === VendorVerificationStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('rejectionReason is required when rejecting a vendor');
    }

    vendor.verificationStatus = dto.decision;
    vendor.verifiedAt         = dto.decision === VendorVerificationStatus.VERIFIED ? new Date() : null;
    vendor.verifiedBy         = dto.decision === VendorVerificationStatus.VERIFIED ? adminId : null;
    vendor.rejectionReason    = dto.rejectionReason ?? null;

    if (dto.decision === VendorVerificationStatus.VERIFIED) {
      // Grant 'vendor' role on user account
      const user = await this.userRepository.findOne({ where: { id: vendor.userId } });
      if (user && !user.roles.includes(Role.VENDOR)) {
        user.roles = [...user.roles, Role.VENDOR];
        await this.userRepository.save(user);
      }
    }

    return this.vendorRepository.save(vendor);
  }

  // ─── Admin: Suspend / unsuspend vendor ──────────────────────────────────────

  async updateVerificationStatus(vendorId: string, status: VendorVerificationStatus) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    vendor.verificationStatus = status;
    if (status === VendorVerificationStatus.SUSPENDED) {
      vendor.isAvailable = false;
    }
    return this.vendorRepository.save(vendor);
  }

  // ─── Documents ───────────────────────────────────────────────────────────────

  async addDocument(vendorId: string, docType: string, fileUrl: string, originalName?: string) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const doc = this.documentRepository.create({
      vendorId,
      documentType: docType as any,
      fileUrl,
      originalName: originalName ?? null,
    });
    return this.documentRepository.save(doc);
  }

  async getDocuments(vendorId: string) {
    return this.documentRepository.find({ where: { vendorId }, order: { createdAt: 'DESC' } });
  }

  // ─── Pricing ─────────────────────────────────────────────────────────────────

  /**
   * Vendor proposes a new pricing list.
   * Enforces the cooldown period (VENDOR_PRICING_COOLDOWN_DAYS, default 90).
   */
  async proposePricing(vendorId: string, dto: ProposePricingDto) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // Check cooldown
    const cooldownDays = this.configService.get<number>('VENDOR_PRICING_COOLDOWN_DAYS') ?? 90;
    if (vendor.pricingLastUpdatedAt) {
      const daysSinceLast =
        (Date.now() - vendor.pricingLastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast < cooldownDays) {
        const nextAllowed = new Date(
          vendor.pricingLastUpdatedAt.getTime() + cooldownDays * 24 * 60 * 60 * 1000,
        );
        throw new BadRequestException(
          `You can only update pricing once every ${cooldownDays} days. Next allowed: ${nextAllowed.toISOString().slice(0, 10)}`,
        );
      }
    }

    // Check for an existing pending proposal
    const pending = await this.pricingRepository.findOne({
      where: { vendorId, approvedAt: null as any, rejectedAt: null as any },
    });
    if (pending) {
      throw new ConflictException('You already have a pending pricing proposal. Wait for admin review.');
    }

    const pricing = this.pricingRepository.create({
      vendorId,
      items: dto.items,
      effectiveFrom: null,
      approvedAt: null,
      approvedBy: null,
    });
    return this.pricingRepository.save(pricing);
  }

  async getPricingHistory(vendorId: string) {
    return this.pricingRepository.find({
      where: { vendorId },
      order: { proposedAt: 'DESC' },
      take: 20,
    });
  }

  async getActivePricing(vendorId: string): Promise<VendorPricing | null> {
    return this.pricingRepository
      .createQueryBuilder('p')
      .where('p.vendorId = :vendorId', { vendorId })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getOne();
  }

  /** Admin approves a pending pricing proposal */
  async approvePricing(pricingId: string, dto: ApprovePricingDto, adminId: string) {
    const pricing = await this.pricingRepository.findOne({ where: { id: pricingId } });
    if (!pricing) throw new NotFoundException('Pricing proposal not found');
    if (pricing.approvedAt) throw new BadRequestException('Pricing is already approved');
    if (pricing.rejectedAt) throw new BadRequestException('Pricing has already been rejected');

    pricing.approvedAt   = new Date();
    pricing.approvedBy   = adminId;
    pricing.effectiveFrom = new Date(dto.effectiveFrom);
    await this.pricingRepository.save(pricing);

    // Update vendor.pricingLastUpdatedAt
    await this.vendorRepository.update(pricing.vendorId, {
      pricingLastUpdatedAt: new Date(),
    });

    return pricing;
  }

  /** Admin rejects a pending pricing proposal */
  async rejectPricing(pricingId: string, dto: RejectPricingDto, adminId: string) {
    const pricing = await this.pricingRepository.findOne({ where: { id: pricingId } });
    if (!pricing) throw new NotFoundException('Pricing proposal not found');
    if (pricing.approvedAt) throw new BadRequestException('Pricing is already approved');
    if (pricing.rejectedAt) throw new BadRequestException('Pricing has already been rejected');

    pricing.rejectedAt       = new Date();
    pricing.rejectionReason  = dto.reason;
    return this.pricingRepository.save(pricing);
  }

  // ─── Wallet ──────────────────────────────────────────────────────────────────

  async getWallet(vendorId: string) {
    const wallet = await this.walletRepository.findOne({ where: { vendorId } });
    if (!wallet) throw new NotFoundException('Vendor wallet not found');
    return wallet;
  }

  async getLedger(vendorId: string, page = 1, limit = 20) {
    const [entries, total] = await this.ledgerRepository.findAndCount({
      where: { vendorId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: entries, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /**
   * Credit the vendor earnings wallet.
   * Called internally by OrdersService on order completion.
   */
  async creditWallet(
    vendorId: string,
    amount: number,
    source: LedgerSource,
    description: string,
    meta?: { orderId?: string; nairaSnapshot?: number; reference?: string },
  ) {
    const wallet = await this.walletRepository.findOne({ where: { vendorId } });
    if (!wallet) throw new NotFoundException('Vendor wallet not found');
    if (wallet.status === 'frozen') throw new ForbiddenException('Vendor wallet is frozen');

    const balanceBefore = wallet.balance;
    wallet.balance    += amount;
    wallet.totalEarned += amount;
    await this.walletRepository.save(wallet);

    const entry = this.ledgerRepository.create({
      walletId: wallet.id,
      vendorId,
      type: 'credit',
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      source,
      orderId: meta?.orderId ?? null,
      nairaSnapshot: meta?.nairaSnapshot ?? null,
      reference: meta?.reference ?? null,
      description,
      metadata: null,
    });
    await this.ledgerRepository.save(entry);

    return wallet;
  }

  /**
   * Debit the vendor earnings wallet (for payouts).
   */
  async debitWallet(
    vendorId: string,
    amount: number,
    source: LedgerSource,
    description: string,
    meta?: { reference?: string },
  ) {
    const wallet = await this.walletRepository.findOne({ where: { vendorId } });
    if (!wallet) throw new NotFoundException('Vendor wallet not found');
    if (wallet.status === 'frozen') throw new ForbiddenException('Vendor wallet is frozen');
    if (wallet.balance < amount) throw new BadRequestException('Insufficient balance');

    const balanceBefore = wallet.balance;
    wallet.balance -= amount;
    await this.walletRepository.save(wallet);

    const entry = this.ledgerRepository.create({
      walletId: wallet.id,
      vendorId,
      type: 'debit',
      amount,
      balanceBefore,
      balanceAfter: wallet.balance,
      source,
      orderId: null,
      nairaSnapshot: null,
      reference: meta?.reference ?? null,
      description,
      metadata: null,
    });
    await this.ledgerRepository.save(entry);

    return wallet;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private sanitizeUser(user: User) {
    const { passwordHash, ...safe } = user as any;
    return safe;
  }
}
