import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayoutRequest } from '../../database/entities/payout-request.entity';
import { Rep } from '../../database/entities/rep.entity';
import { RepPseudoWallet } from '../../database/entities/rep-pseudo-wallet.entity';
import { RepBonusTier } from '../../database/entities/rep-bonus-tier.entity';
import { RatingEvent } from '../../database/entities/rating-event.entity';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { PayoutStatus } from '../../common/enums/payout-status.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { VendorsService } from '../vendors/vendors.service';
import { RepsService } from '../reps/reps.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PaystackService } from '../payments/paystack.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    @InjectRepository(PayoutRequest)
    private payoutRepository: Repository<PayoutRequest>,

    @InjectRepository(Rep)
    private repRepository: Repository<Rep>,

    @InjectRepository(RepPseudoWallet)
    private repWalletRepository: Repository<RepPseudoWallet>,

    @InjectRepository(RepBonusTier)
    private bonusTierRepository: Repository<RepBonusTier>,

    @InjectRepository(RatingEvent)
    private ratingEventRepository: Repository<RatingEvent>,

    private vendorsService: VendorsService,
    private repsService: RepsService,
    private platformConfigService: PlatformConfigService,
    private paystackService: PaystackService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Vendor: request payout ───────────────────────────────────────────────────

  async requestPayout(vendorId: string, dto: RequestPayoutDto) {
    const wallet = await this.vendorsService.getWallet(vendorId);
    if (wallet.balance < dto.amountWP) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${wallet.balance} WP, Requested: ${dto.amountWP} WP`,
      );
    }

    const config = await this.platformConfigService.getConfig();
    const nairaAmount = dto.amountWP * config.payoutRateNairaPerWP;

    const payout = this.payoutRepository.create({
      vendorId,
      amountWP:           dto.amountWP,
      nairaAmount,
      payoutRateSnapshot: config.payoutRateNairaPerWP,
      bankCode:           dto.bankCode,
      accountNumber:      dto.accountNumber,
      accountName:        dto.accountName,
      status:             PayoutStatus.PENDING,
    });
    const saved = await this.payoutRepository.save(payout);

    // Notify admin of new payout request
    const vendor = await this.vendorsService.findOne(vendorId);
    if (vendor) {
      this.notificationsService.notifyNewPayoutRequest({
        vendorId,
        vendorName:  vendor.businessName,
        amountWP:    dto.amountWP,
        nairaAmount,
        payoutId:    saved.id,
      });
    }

    return saved;
  }

  // ─── Admin: approve payout ────────────────────────────────────────────────────

  async approvePayout(payoutId: string, adminId: string) {
    const payout = await this.payoutRepository.findOne({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Payout request not found');
    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException('Only pending payouts can be approved');
    }

    // Move to PROCESSING and record approval
    payout.status      = PayoutStatus.PROCESSING;
    payout.approvedBy  = adminId;
    payout.approvedAt  = new Date();
    payout.processedAt = new Date();
    await this.payoutRepository.save(payout);

    // Debit vendor wallet first (atomic commitment before hitting Paystack)
    await this.vendorsService.debitWallet(
      payout.vendorId,
      payout.amountWP,
      LedgerSource.VENDOR_PAYOUT,
      `Payout approved: ${payout.id}`,
      { reference: payout.id },
    );

    try {
      // 1. Create a Paystack transfer recipient for this bank account
      const recipientCode = await this.paystackService.createTransferRecipient({
        name:          payout.accountName,
        accountNumber: payout.accountNumber,
        bankCode:      payout.bankCode,
      });

      // 2. Initiate the transfer
      const paystackRef = `wm-payout-${payout.id}`;
      const { transferCode, status } = await this.paystackService.initiateTransfer({
        amountNaira:   payout.nairaAmount,
        recipientCode,
        reason:        `Washermann vendor payout: ${payout.id}`,
        reference:     paystackRef,
      });

      // 3. Record transfer details and mark completed
      //    Paystack transfers with OTP disabled complete immediately (status='success' or 'pending').
      //    A 'pending' status means it's queued — Paystack sends a transfer.success webhook.
      payout.paystackReference    = paystackRef;
      payout.paystackTransferCode = transferCode;
      payout.status               = status === 'success' ? PayoutStatus.COMPLETED : PayoutStatus.PROCESSING;
      if (status === 'success') payout.completedAt = new Date();

      this.logger.log(
        `Payout ${payout.id}: Paystack transfer initiated — code=${transferCode}, status=${status}`,
      );
    } catch (err) {
      // Transfer call failed — revert to FAILED so admin can retry
      this.logger.error(`Payout ${payout.id}: Paystack transfer failed — ${(err as Error).message}`);
      payout.status        = PayoutStatus.FAILED;
      payout.failureReason = (err as Error).message;
    }

    await this.payoutRepository.save(payout);

    // Fire payout notification
    if (payout.status === PayoutStatus.FAILED) {
      this.notificationsService.notifyPayoutFailed({
        vendorId:      payout.vendorId,
        nairaAmount:   payout.nairaAmount,
        amountWP:      payout.amountWP,
        failureReason: payout.failureReason ?? 'Unknown error',
        payoutId:      payout.id,
      });
    } else {
      this.notificationsService.notifyPayoutApproved({
        vendorId:      payout.vendorId,
        nairaAmount:   payout.nairaAmount,
        amountWP:      payout.amountWP,
        accountName:   payout.accountName,
        accountNumber: payout.accountNumber,
        bankCode:      payout.bankCode,
        payoutId:      payout.id,
      });
    }

    return payout;
  }

  // ─── Admin: list payouts ──────────────────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    vendorId?: string;
    status?: PayoutStatus;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.payoutRepository
      .createQueryBuilder('p')
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.vendorId) qb.andWhere('p.vendorId = :v', { v: query.vendorId });
    if (query.status)   qb.andWhere('p.status = :s', { s: query.status });

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Rep bonus cycle calculation ──────────────────────────────────────────────

  /**
   * Calculate and credit bonus for all active reps.
   * Called by a cron job at the end of each bonus cycle.
   *
   * Returns a report of the cycle run.
   */
  async runBonusCycle(triggeredBy: string): Promise<{
    processedReps: number;
    totalBonusWP: number;
    report: Array<{
      repId: string;
      cycleWP: number;
      avgRating: number;
      bonusPercent: number;
      bonusWP: number;
    }>;
  }> {
    this.logger.log(`Bonus cycle started by ${triggeredBy}`);

    const config      = await this.platformConfigService.getConfig();
    const bonusTiers  = await this.bonusTierRepository.find({
      where: { isActive: true },
      order: { minRating: 'DESC' },
    });

    const reps = await this.repRepository.find({ where: { status: 'active' as any } });
    const report = [];
    let totalBonusWP = 0;

    for (const rep of reps) {
      const wallet = await this.repWalletRepository.findOne({ where: { repId: rep.id } });
      if (!wallet || wallet.balance === 0) continue;

      // Calculate 30-day average rating for this rep
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ratingResult = await this.ratingEventRepository
        .createQueryBuilder('r')
        .select('AVG(r.repScore)', 'avg')
        .where('r.repId = :repId', { repId: rep.id })
        .andWhere('r.submittedAt >= :since', { since: thirtyDaysAgo })
        .andWhere('r.repScore IS NOT NULL')
        .getRawOne();

      const avgRating  = parseFloat(ratingResult.avg ?? '0');
      const cycleWP    = wallet.balance;

      // Find the matching bonus tier
      const tier = bonusTiers.find(
        (t) => avgRating >= t.minRating && avgRating <= t.maxRating,
      );
      const bonusPercent = tier?.bonusPercent ?? 0;
      const bonusWP      = Math.floor(cycleWP * (bonusPercent / 100));

      if (bonusWP > 0) {
        await this.repsService.creditWallet(
          rep.id,
          bonusWP,
          LedgerSource.REP_BONUS,
          `Bonus cycle credit — ${config.bonusCyclePeriod} cycle`,
          { reference: `bonus-${new Date().toISOString().slice(0, 7)}` },
        );
        totalBonusWP += bonusWP;
      }

      // Handle flag review if below threshold
      if (tier?.flagReview && !rep.flaggedForReview) {
        rep.flaggedForReview = true;
        rep.flaggedAt        = new Date();
        await this.repRepository.save(rep);
      }

      // Reset cycle balance
      await this.repsService.resetCycleBalance(rep.id);

      report.push({ repId: rep.id, cycleWP, avgRating, bonusPercent, bonusWP });
    }

    this.logger.log(
      `Bonus cycle complete: ${reps.length} reps processed, ${totalBonusWP} WP in bonuses distributed`,
    );

    return { processedReps: reps.length, totalBonusWP, report };
  }

  // ─── Admin: manually trigger bonus cycle ─────────────────────────────────────

  async triggerBonusCycle(adminId: string) {
    return this.runBonusCycle(adminId);
  }

  // ─── Vendor: own payout history ───────────────────────────────────────────────

  async getVendorPayouts(vendorId: string, page = 1, limit = 20) {
    return this.findAll({ page, limit, vendorId });
  }
}
