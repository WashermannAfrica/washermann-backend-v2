import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository, IsNull } from 'typeorm';
import { ReferralsService } from '../referrals/referrals.service';
import { v4 as uuidv4 } from 'uuid';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorDocument } from '../../database/entities/vendor-document.entity';
import { VendorPricing, GarmentPriceItem, priceItemKey, isPriceItemLive } from '../../database/entities/vendor-pricing.entity';
import { VendorEarningsWallet } from '../../database/entities/vendor-earnings-wallet.entity';
import { VendorLedgerEntry } from '../../database/entities/vendor-ledger-entry.entity';
import { User } from '../../database/entities/user.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ProposePricingDto } from './dto/propose-pricing.dto';
import { ApprovePricingDto, RejectPricingDto, DecidePricingItemDto } from './dto/approve-pricing.dto';
import { VerifyVendorDto } from './dto/verify-vendor.dto';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../redis/redis.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { AreasService } from '../areas/areas.service';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

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

    @InjectRepository(ConversionRate)
    private conversionRateRepository: Repository<ConversionRate>,

    private dataSource: DataSource,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private redisService: RedisService,
    private referralsService: ReferralsService,
    private platformConfigService: PlatformConfigService,
    private areasService: AreasService,
  ) {}

  // ─── Admin: Create vendor (new user + vendor record + wallet) ─────────────────

  async adminCreate(dto: RegisterVendorDto, adminId: string) {
    const existing = await this.userRepository.findOne({
      where: [{ email: dto.email.toLowerCase() }, { phone: dto.phone }],
    });
    if (existing) {
      throw new ConflictException('A user with this email or phone already exists');
    }

    await this.areasService.assertAreasExist(dto.areaIds ?? []);

    const result = await this.dataSource.transaction(async (manager) => {
      const user = manager.create(User, {
        fullName: dto.fullName.trim(),
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone.trim(),
        passwordHash: null,
        roles: [Role.VENDOR],
        emailVerified: false,
      });
      await manager.save(user);

      const vendor = manager.create(Vendor, {
        userId: user.id,
        businessName: dto.businessName.trim(),
        phone: dto.phone.trim(),
        areaIds: dto.areaIds ?? [],
        verificationStatus: VendorVerificationStatus.PENDING_REVIEW,
        isAvailable: false,
        rating: 0,
        ratingCount: 0,
      });
      await manager.save(vendor);

      const wallet = manager.create(VendorEarningsWallet, {
        vendorId: vendor.id,
        balance: 0,
        totalEarned: 0,
        status: 'active',
      });
      await manager.save(wallet);

      return { vendor, user };
    });

    // Generate invite token and send email outside the transaction
    const inviteToken = uuidv4();
    const INVITE_TTL = 7 * 24 * 60 * 60;
    await this.redisService.setEx(
      `invite:${inviteToken}`,
      INVITE_TTL,
      result.user.id,
    );

    const deepLinkBase =
      this.configService.get<string>('app.deepLinkBase') ??
      'https://app.washermann.com';
    const sendInvite = () =>
      this.notificationsService.sendVendorInvite({
        fullName: result.user.fullName,
        email: result.user.email,
        businessName: result.vendor.businessName,
        inviteToken,
        deepLinkBase,
      });
    sendInvite().catch((err: Error) =>
      this.logger.error(`Vendor invite email failed: ${err.message}`),
    );

    return { vendor: result.vendor, user: this.sanitizeUser(result.user) };
  }

  // ─── List vendors (admin) ─────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    search?: string;
    verificationStatus?: VendorVerificationStatus;
    isAvailable?: boolean;
    sortBy?: string;
    sortDir?: 'ASC' | 'DESC';
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    // Whitelist sortable columns — never interpolate a raw key into SQL.
    const SORTABLE: Record<string, string> = {
      createdAt: 'v.createdAt',
      joined: 'v.createdAt',
      name: 'u.fullName',
      status: 'v.verificationStatus',
      rating: 'v.rating',
    };
    const sortCol = SORTABLE[query.sortBy ?? ''] ?? 'v.createdAt';
    const sortDir = query.sortDir === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.vendorRepository
      .createQueryBuilder('v')
      .leftJoin('v.user', 'u')
      .addSelect(['u.id', 'u.fullName', 'u.email', 'u.phone'])
      // Per-vendor aggregates so the admin list can show orders / earnings / balance.
      .leftJoin('vendor_earnings_wallets', 'w', 'w.vendor_id = v.id')
      .addSelect('COALESCE(w.total_earned, 0)', 'earnedwp')
      .addSelect('COALESCE(w.balance, 0)', 'balancewp')
      .addSelect('(SELECT COUNT(*) FROM orders o WHERE o.vendor_id = v.id)', 'ordercount')
      .orderBy(sortCol, sortDir)
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

    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const data = entities.map((v, i) => ({
      ...v,
      orderCount: Number(raw[i]?.ordercount ?? 0),
      earnedWp:   Number(raw[i]?.earnedwp ?? 0),
      balanceWp:  Number(raw[i]?.balancewp ?? 0),
    }));
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
    if (dto.areaIds      != null) {
      await this.areasService.assertAreasExist(dto.areaIds);
      vendor.areaIds = dto.areaIds;
    }
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

    const saved = await this.vendorRepository.save(vendor);

    if (dto.decision === VendorVerificationStatus.VERIFIED) {
      this.notificationsService.notifyVendorVerified({ vendorId });
      // Referral: vendor approval is the vendor-leg unlock trigger (fire-and-forget).
      this.referralsService
        .onRefereeQualified(vendor.userId, 'vendor')
        .catch((err) => this.logger.error(`Referral unlock (vendor) failed: ${err.message}`));
    } else if (dto.decision === VendorVerificationStatus.REJECTED) {
      // Rejected vendors were previously told nothing at all — always explain why.
      this.notificationsService.notifyVendorRejected({
        vendorId,
        reason: dto.rejectionReason,
      });
    }

    return saved;
  }

  // ─── Admin: Suspend / unsuspend vendor ──────────────────────────────────────

  async updateVerificationStatus(
    vendorId: string,
    status: VendorVerificationStatus,
    reason?: string,
  ) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    const previousStatus = vendor.verificationStatus;
    vendor.verificationStatus = status;
    if (status === VendorVerificationStatus.SUSPENDED) {
      vendor.isAvailable = false;
    }
    const saved = await this.vendorRepository.save(vendor);

    // Tell the vendor their account was deactivated — previously this was silent.
    // Only on the transition INTO suspension, so re-suspending doesn't re-notify.
    if (
      status === VendorVerificationStatus.SUSPENDED &&
      previousStatus !== VendorVerificationStatus.SUSPENDED
    ) {
      this.notificationsService.notifyVendorSuspended({ vendorId, reason });
    }

    return saved;
  }

  // ─── Admin: Revert a verification to pending review ─────────────────────────
  /**
   * Full undo of an accidental verification: returns the vendor to
   * `pending_review` as if never actioned, clears the verification stamp,
   * takes them offline, and REVOKES the `vendor` role on the user account
   * (which `verify` granted). Use this when a vendor was verified by mistake
   * and should go back into the review queue.
   */
  async revertToPending(vendorId: string, adminId: string) {
    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    if (vendor.verificationStatus === VendorVerificationStatus.PENDING_REVIEW) {
      throw new BadRequestException('Vendor is already pending review');
    }

    vendor.verificationStatus = VendorVerificationStatus.PENDING_REVIEW;
    vendor.verifiedAt         = null;
    vendor.verifiedBy         = null;
    vendor.rejectionReason    = null;
    vendor.isAvailable        = false; // can't receive orders while unreviewed
    const saved = await this.vendorRepository.save(vendor);

    // Revoke the vendor role that verify() granted, so an accidental
    // verification is fully rolled back and no vendor-guarded route stays open.
    // const user = await this.userRepository.findOne({ where: { id: vendor.userId } });
    // if (user && user.roles.includes(Role.VENDOR)) {
    //   user.roles = user.roles.filter((r) => r !== Role.VENDOR);
    //   await this.userRepository.save(user);
    // }

    this.logger.log(`Vendor ${vendorId} reverted to pending_review by admin ${adminId}`);
    return saved;
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

    // Already-approved (live) prices are LOCKED — carry them forward unchanged and
    // ignore any incoming attempt to alter them. The vendor may only (re)price the
    // items that aren't approved (new ones + ones the admin rejected).
    const active = await this.getActivePricing(vendorId);
    const approvedLocked: GarmentPriceItem[] = (active?.items ?? [])
      .filter(isPriceItemLive)
      .map((i) => ({
        itemId: i.itemId,
        garmentType: i.garmentType,
        priceNaira: i.priceNaira,
        status: 'approved' as const,
        rejectionReason: null,
        decidedAt: i.decidedAt ?? null,
      }));
    const lockedKeys = new Set(approvedLocked.map(priceItemKey));

    // Sanitise incoming: vendors cannot set review status, and locked lines are dropped.
    const incoming: GarmentPriceItem[] = (dto.items ?? [])
      .map((i) => ({ itemId: i.itemId, garmentType: i.garmentType, priceNaira: i.priceNaira }))
      .filter((i) => !lockedKeys.has(priceItemKey(i)));

    // If a draft proposal is still open (not yet reviewed), accumulate into it;
    // otherwise start a fresh one. Either way it = [locked-approved] + [editable].
    const pending = await this.pricingRepository.findOne({
      where: { vendorId, approvedAt: IsNull(), rejectedAt: IsNull() },
    });
    const existingEditable = (pending?.items ?? []).filter((i) => !lockedKeys.has(priceItemKey(i)));
    const editable = this.mergePricingItems(existingEditable, incoming);
    const items = [...approvedLocked, ...editable];

    if (pending) {
      pending.items = items;
      return this.pricingRepository.save(pending);
    }

    const pricing = this.pricingRepository.create({
      vendorId,
      items,
      effectiveFrom: null,
      approvedAt: null,
      approvedBy: null,
    });
    return this.pricingRepository.save(pricing);
  }

  /** Merge a new batch of price items into an existing list (incoming wins), keyed by itemId then garmentType. */
  private mergePricingItems(existing: GarmentPriceItem[], incoming: GarmentPriceItem[]): GarmentPriceItem[] {
    const keyOf = (i: GarmentPriceItem) => i.itemId ?? `gt:${i.garmentType}`;
    const merged = new Map<string, GarmentPriceItem>();
    for (const item of existing ?? []) merged.set(keyOf(item), item);
    for (const item of incoming ?? []) merged.set(keyOf(item), item);
    return Array.from(merged.values());
  }

  async getPricingHistory(vendorId: string) {
    return this.pricingRepository.find({
      where: { vendorId },
      order: { proposedAt: 'DESC' },
      take: 20,
    });
  }

  /** Vendor: their most recent pricing proposal (pending or active) — for pre-filling the editor. */
  async getLatestPricing(vendorId: string): Promise<VendorPricing | null> {
    return this.pricingRepository.findOne({
      where: { vendorId },
      order: { proposedAt: 'DESC' },
    });
  }

  /**
   * Admin: pricing proposals still needing review across all vendors.
   * Includes brand-new proposals AND ones partially reviewed per-item
   * (approvedAt may be set once review starts, but pending lines remain).
   */
  async listPendingPricing() {
    return this.pricingRepository
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.vendor', 'vendor')
      .where('p.rejectedAt IS NULL')
      .andWhere(`(p.approvedAt IS NULL OR p.items @> '[{"status":"pending"}]')`)
      .orderBy('p.proposedAt', 'ASC')
      .getMany();
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

  /**
   * Market reference for a garment type the assigned vendor did NOT price:
   * the AVERAGE of the live approved prices of vendors who DO price it
   * (latest active sheet per vendor, excluding the assigned vendor).
   * Returns null when nobody prices it.
   */
  async averageLivePriceForGarment(garmentType: string, excludeVendorId?: string): Promise<number | null> {
    const sheets = await this.pricingRepository
      .createQueryBuilder('p')
      .where('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getMany();

    const seenVendors = new Set<string>();
    const prices: number[] = [];
    for (const sheet of sheets) {
      if (seenVendors.has(sheet.vendorId)) continue; // only each vendor's latest active sheet
      seenVendors.add(sheet.vendorId);
      if (excludeVendorId && sheet.vendorId === excludeVendorId) continue;
      for (const item of sheet.items) {
        if (!isPriceItemLive(item)) continue;
        if (item.garmentType === garmentType && item.priceNaira > 0) {
          prices.push(item.priceNaira);
          break;
        }
      }
    }
    if (!prices.length) return null;
    return Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100;
  }

  /**
   * System reference (arithmetic MEAN) for a CATALOGUE ITEM the assigned vendor
   * did NOT price: the average of the live approved prices across every other
   * vendor's latest active sheet (matched by catalogue item id). Returns null
   * when no vendor prices the item. Used as the garment-log fallback price —
   * vendors who set their own price are paid 100% of it; vendors who didn't are
   * paid this mean.
   */
  async averageLivePriceForItem(itemId: string, excludeVendorId?: string): Promise<number | null> {
    const sheets = await this.pricingRepository
      .createQueryBuilder('p')
      .where('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getMany();

    const seenVendors = new Set<string>();
    const prices: number[] = [];
    for (const sheet of sheets) {
      if (seenVendors.has(sheet.vendorId)) continue; // only each vendor's latest active sheet
      seenVendors.add(sheet.vendorId);
      if (excludeVendorId && sheet.vendorId === excludeVendorId) continue;
      for (const item of sheet.items) {
        if (!isPriceItemLive(item)) continue;
        if (item.itemId === itemId && item.priceNaira > 0) {
          prices.push(item.priceNaira);
          break;
        }
      }
    }
    if (!prices.length) return null;
    return Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100;
  }

  /** Load a proposal that is still open for review (not fully finalized as rejected). */
  private async loadReviewableProposal(pricingId: string): Promise<VendorPricing> {
    const pricing = await this.pricingRepository.findOne({ where: { id: pricingId } });
    if (!pricing) throw new NotFoundException('Pricing proposal not found');
    if (pricing.rejectedAt) throw new BadRequestException('This pricing proposal has already been fully rejected');
    return pricing;
  }

  /**
   * Admin STAGES an approve/reject on a SINGLE price line. The decision is
   * recorded but NOT yet live and NO email is sent — nothing reaches the vendor
   * until the admin finalizes the review (one summary email, one price change).
   */
  async decidePricingItem(pricingId: string, dto: DecidePricingItemDto, _adminId: string) {
    if (dto.decision === 'rejected' && !dto.reason?.trim()) {
      throw new BadRequestException('A reason is required when rejecting a price line');
    }
    const pricing = await this.loadReviewableProposal(pricingId);
    if (pricing.approvedAt) throw new BadRequestException('This review has already been finalized');

    const target = pricing.items.find((i) => priceItemKey(i) === dto.itemKey);
    if (!target) throw new NotFoundException(`No price line matching "${dto.itemKey}" in this proposal`);

    const nowIso = new Date().toISOString();
    pricing.items = pricing.items.map((i) =>
      priceItemKey(i) === dto.itemKey
        ? {
            ...i,
            status: dto.decision,
            rejectionReason: dto.decision === 'rejected' ? (dto.reason?.trim() ?? null) : null,
            decidedAt: nowIso,
          }
        : i,
    );
    return this.pricingRepository.save(pricing); // staged only — approvedAt stays null
  }

  /** Lock the sheet: approved lines go live, cooldown starts only when the sheet is fully clean. */
  private async finalizeReview(pricing: VendorPricing, adminId: string, effectiveFrom: Date) {
    pricing.approvedBy = adminId;
    pricing.approvedAt = new Date();
    pricing.effectiveFrom = effectiveFrom;
    pricing.rejectionReason = null;

    // Drift Option 2 — LOCK the WP/₦ rate onto the sheet at approval. Earnings
    // minted under this sheet and their payout burn both use this snapshot, so
    // the vendor's ₦-in equals ₦-out regardless of later platform rate moves.
    const activeRate = await this.conversionRateRepository
      .createQueryBuilder('r')
      .where('r.currency = :c', { c: 'NGN' })
      .andWhere('r.effective_from <= NOW()')
      .orderBy('r.effective_from', 'DESC')
      .getOne();
    if (activeRate) {
      pricing.conversionRateId = activeRate.id;
      pricing.pointsPerUnitSnapshot = activeRate.pointsPerUnit;
    }

    await this.pricingRepository.save(pricing);

    // Start the re-pricing cooldown ONLY when nothing was rejected — otherwise the
    // vendor still needs to fix + resubmit the rejected lines, which must not be blocked.
    const anyRejected = pricing.items.some((i) => i.status === 'rejected');
    if (!anyRejected) {
      await this.vendorRepository.update(pricing.vendorId, { pricingLastUpdatedAt: new Date() });
    }
    this.notificationsService.notifyPricingReviewed({ vendorId: pricing.vendorId, items: pricing.items });
    return pricing;
  }

  /**
   * Finalize: keep all staged decisions, APPROVE every line the admin did not
   * respond to, then lock the sheet and email the vendor ONE summary.
   */
  async approvePricing(pricingId: string, dto: ApprovePricingDto, adminId: string) {
    const pricing = await this.loadReviewableProposal(pricingId);
    if (pricing.approvedAt) throw new BadRequestException('This review has already been finalized');
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    // Staged rejects stay rejected; everything else (staged-approved + untouched) becomes approved.
    pricing.items = pricing.items.map((i) =>
      i.status === 'rejected' ? i : { ...i, status: 'approved' as const, rejectionReason: null },
    );
    return this.finalizeReview(pricing, adminId, effectiveFrom);
  }

  /**
   * Finalize: keep all staged decisions, REJECT every line the admin did not
   * respond to, then lock the sheet and email the vendor ONE summary. If no line
   * survived as approved the whole proposal is marked rejected so the vendor can
   * submit a fresh one.
   */
  async rejectPricing(pricingId: string, dto: RejectPricingDto, adminId: string) {
    const pricing = await this.loadReviewableProposal(pricingId);
    if (pricing.approvedAt) throw new BadRequestException('This review has already been finalized');

    // Staged approves stay approved; everything else (staged-rejected + untouched) becomes rejected.
    pricing.items = pricing.items.map((i) =>
      i.status === 'approved'
        ? i
        : { ...i, status: 'rejected' as const, rejectionReason: i.rejectionReason ?? dto.reason },
    );

    const anyApproved = pricing.items.some((i) => i.status === 'approved');
    if (!anyApproved) {
      // Nothing survived — fully reject so the vendor can submit a fresh proposal.
      pricing.rejectedAt = new Date();
      pricing.rejectionReason = dto.reason;
      pricing.approvedAt = null;
      pricing.approvedBy = null;
      pricing.effectiveFrom = null;
      await this.pricingRepository.save(pricing);
      this.notificationsService.notifyPricingReviewed({ vendorId: pricing.vendorId, items: pricing.items });
      return pricing;
    }
    return this.finalizeReview(pricing, adminId, new Date());
  }

  // ─── Wallet ──────────────────────────────────────────────────────────────────

  async getWallet(vendorId: string) {
    const wallet = await this.walletRepository.findOne({ where: { vendorId } });
    if (!wallet) throw new NotFoundException('Vendor wallet not found');
    return wallet;
  }

  /**
   * The ₦/WP rate this vendor's WP actually converts at: the snapshot locked on
   * their active pricing sheet (same rate their earnings were minted and payouts
   * burn at), falling back to the global payout rate for pre-lock legacy sheets.
   */
  async effectivePayoutRate(vendorId: string): Promise<number> {
    const active = await this.getActivePricing(vendorId);
    const locked =
      active?.pointsPerUnitSnapshot && active.pointsPerUnitSnapshot > 0
        ? Math.round((1 / active.pointsPerUnitSnapshot) * 10000) / 10000
        : null;
    if (locked) return locked;
    const config = await this.platformConfigService.getConfig();
    return config.payoutRateNairaPerWP;
  }

  /**
   * Wallet with naira-first framing for client display: vendors think in ₦, so
   * the balance and lifetime earnings are returned in naira alongside the WP.
   */
  async getWalletView(vendorId: string) {
    const wallet = await this.getWallet(vendorId);
    const rate = await this.effectivePayoutRate(vendorId);
    const toNaira = (wp: number) => Math.round(wp * rate * 100) / 100;
    return {
      ...wallet,
      payoutRateNairaPerWP: rate,
      balanceNaira: toNaira(wallet.balance),
      totalEarnedNaira: toNaira(wallet.totalEarned),
    };
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
    meta?: { orderId?: string; nairaSnapshot?: number; reference?: string; countAsEarning?: boolean },
  ) {
    const wallet = await this.walletRepository.findOne({ where: { vendorId } });
    if (!wallet) throw new NotFoundException('Vendor wallet not found');
    if (wallet.status === 'frozen') throw new ForbiddenException('Vendor wallet is frozen');

    const balanceBefore = wallet.balance;
    wallet.balance += amount;
    // Reversals (e.g. failed-payout re-credits) restore the balance without
    // inflating lifetime earnings.
    if (meta?.countAsEarning !== false) wallet.totalEarned += amount;
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
