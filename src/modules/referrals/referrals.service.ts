import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ReferralCode, ReferrerType, ReferredType } from '../../database/entities/referral-code.entity';
import { Referral, RewardCurrency } from '../../database/entities/referral.entity';
import { RewardRule } from '../../database/entities/reward-rule.entity';
import { User } from '../../database/entities/user.entity';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

@Injectable()
export class ReferralsService implements OnModuleInit {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(ReferralCode) private codes: Repository<ReferralCode>,
    @InjectRepository(Referral) private referrals: Repository<Referral>,
    @InjectRepository(RewardRule) private rules: Repository<RewardRule>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /** Attach referrer + referred user names/emails to a list of referrals. */
  private async withNames(list: Referral[]) {
    const ids = Array.from(new Set(list.flatMap((r) => [r.referrerUserId, r.referredUserId])));
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return list.map((r) => ({
      ...r,
      referrerName: byId.get(r.referrerUserId)?.fullName ?? null,
      referredName: byId.get(r.referredUserId)?.fullName ?? null,
      referredEmail: byId.get(r.referredUserId)?.email ?? null,
    }));
  }

  async onModuleInit() {
    try { await this.seedDefaultRules(); }
    catch (err) { this.logger.warn(`Skipped reward-rule seeding (${(err as Error).message})`); }
  }

  // ─── Reward rules (admin-configurable; placeholder defaults = CAC levers) ──────
  async seedDefaultRules() {
    const defaults: Array<[ReferrerType, ReferredType, number]> = [
      ['customer', 'customer', 200], ['customer', 'vendor', 500],
      ['vendor', 'customer', 200],   ['vendor', 'vendor', 500],
      ['sales_rep', 'customer', 500],['sales_rep', 'vendor', 1000],
      ['rep', 'customer', 500],      ['rep', 'vendor', 1000],
    ];
    let n = 0;
    for (const [rt, rdt, value] of defaults) {
      const exists = await this.rules.findOne({ where: { referrerType: rt, referredType: rdt } });
      if (!exists) {
        await this.rules.save(this.rules.create({ referrerType: rt, referredType: rdt, kind: 'fixed', value, active: true }));
        n++;
      }
    }
    if (n) this.logger.log(`Seeded ${n} reward rule(s)`);
  }

  listRules() { return this.rules.find({ order: { referrerType: 'ASC', referredType: 'ASC' } }); }

  async upsertRule(dto: Partial<RewardRule> & { referrerType: ReferrerType; referredType: ReferredType }) {
    const existing = await this.rules.findOne({ where: { referrerType: dto.referrerType, referredType: dto.referredType } });
    const row = existing ?? this.rules.create({ referrerType: dto.referrerType, referredType: dto.referredType });
    if (dto.kind != null) row.kind = dto.kind;
    if (dto.value != null) row.value = dto.value;
    if (dto.vendorApprovalBonus !== undefined) row.vendorApprovalBonus = dto.vendorApprovalBonus ?? null;
    if (dto.tiers !== undefined) row.tiers = dto.tiers ?? null;
    if (dto.active != null) row.active = dto.active;
    return this.rules.save(row);
  }

  // ─── Codes ────────────────────────────────────────────────────────────────────
  private currencyFor(t: ReferrerType): RewardCurrency {
    return t === 'sales_rep' || t === 'rep' ? 'cash' : 'wp';
  }

  /** Collision-proof unique code, e.g. WM-AB12CD. */
  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      let s = '';
      for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      const code = `WM-${s}`;
      if (!(await this.codes.findOne({ where: { code } }))) return code;
    }
    throw new Error('Could not generate a unique referral code');
  }

  /** Issue (idempotently) the owner's single referral code. */
  async issueCode(ownerUserId: string, ownerType: ReferrerType): Promise<ReferralCode> {
    const existing = await this.codes.findOne({ where: { ownerUserId } });
    if (existing) return existing;
    try {
      return await this.codes.save(this.codes.create({ code: await this.uniqueCode(), ownerUserId, ownerType, isActive: true }));
    } catch {
      // race: another request created it
      return (await this.codes.findOne({ where: { ownerUserId } }))!;
    }
  }

  // ─── Attribution at signup ─────────────────────────────────────────────────────
  /** Record a referral when a new user signs up with a code. Never blocks signup. */
  async attribute(code: string | undefined, referredUserId: string, referredType: ReferredType): Promise<Referral | null> {
    if (!code) return null;
    const rc = await this.codes.findOne({ where: { code: code.trim(), isActive: true } });
    if (!rc) return null;                                   // invalid code — ignore
    if (rc.ownerUserId === referredUserId) return null;     // no self-referral
    const existing = await this.referrals.findOne({ where: { referredUserId } });
    if (existing) return existing;                          // one referral per referee (fixed attribution)

    const rule = await this.rules.findOne({ where: { referrerType: rc.ownerType, referredType, active: true } });
    return this.referrals.save(this.referrals.create({
      code: rc.code, referrerUserId: rc.ownerUserId, referrerType: rc.ownerType,
      referredUserId, referredType, status: 'pending',
      rewardKind: rule?.kind ?? null, rewardValue: rule?.value ?? null,
      rewardCurrency: this.currencyFor(rc.ownerType), rewardAmount: null,
    }));
  }

  // ─── Unlock hooks (split-leg) ──────────────────────────────────────────────────
  /**
   * Marks a pending referral AVAILABLE once the referee proves real:
   *  - customer leg → their first completed order (pass orderValue)
   *  - vendor leg   → admin approval
   */
  async onRefereeQualified(referredUserId: string, referredType: ReferredType, orderValue?: { wp: number; ngn: number }) {
    const ref = await this.referrals.findOne({ where: { referredUserId, status: 'pending' } });
    if (!ref || ref.referredType !== referredType) return;
    const rule = await this.rules.findOne({ where: { referrerType: ref.referrerType, referredType, active: true } });

    let amount = 0;
    if (rule) {
      if (rule.kind === 'percent' && orderValue) {
        const basis = ref.rewardCurrency === 'wp' ? orderValue.wp : orderValue.ngn;
        amount = Math.round(basis * (Number(rule.value) / 100) * 100) / 100;
      } else {
        amount = Number(rule.value);
      }
      if (referredType === 'vendor' && rule.vendorApprovalBonus) amount += Number(rule.vendorApprovalBonus);
    }
    ref.rewardAmount = amount;
    ref.status = 'available';
    ref.unlockedAt = new Date();
    await this.referrals.save(ref);
    this.logger.log(`Referral ${ref.id} available — ${amount} ${ref.rewardCurrency} to ${ref.referrerType} ${ref.referrerUserId}`);
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────--
  async validate(code: string) {
    const rc = await this.codes.findOne({ where: { code: code.trim(), isActive: true } });
    return rc ? { valid: true, referrerType: rc.ownerType } : { valid: false };
  }

  async myReferrals(referrerUserId: string) {
    const list = await this.referrals.find({ where: { referrerUserId }, order: { createdAt: 'DESC' } });
    const code = await this.codes.findOne({ where: { ownerUserId: referrerUserId } });
    const sum = (s: string) => list.filter((r) => r.status === s).reduce((a, r) => a + Number(r.rewardAmount ?? 0), 0);
    return {
      code: code?.code ?? null,
      counts: { pending: list.filter((r) => r.status === 'pending').length, available: list.filter((r) => r.status === 'available').length, paid: list.filter((r) => r.status === 'paid').length },
      payout: { pending: sum('pending'), available: sum('available'), paid: sum('paid') },
      referrals: await this.withNames(list),
    };
  }

  async listReferrals(filters?: { status?: string; referrerType?: string; referredType?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.referrerType) where.referrerType = filters.referrerType;
    if (filters?.referredType) where.referredType = filters.referredType;
    const list = await this.referrals.find({ where, order: { createdAt: 'DESC' } });
    return this.withNames(list);
  }

  /** Admin: flag/reject a referral (e.g. suspected fraud). Cannot reject a paid one. */
  async rejectReferral(id: string, adminId: string, note?: string) {
    const ref = await this.referrals.findOne({ where: { id } });
    if (!ref) throw new NotFoundException('Referral not found');
    if (ref.status === 'paid') throw new BadRequestException('Cannot reject an already-paid referral');
    ref.status = 'rejected';
    ref.reviewedBy = adminId;
    ref.adminNote = note ?? null;
    await this.referrals.save(ref);
    this.logger.warn(`Referral ${id} rejected by ${adminId}${note ? ` — ${note}` : ''}`);
    return ref;
  }

  /** Admin: manually override the reward amount (audited). */
  async adjustReferral(id: string, adminId: string, rewardAmount: number, note?: string) {
    const ref = await this.referrals.findOne({ where: { id } });
    if (!ref) throw new NotFoundException('Referral not found');
    if (ref.status === 'paid') throw new BadRequestException('Cannot adjust an already-paid referral');
    ref.rewardAmount = Math.round(rewardAmount * 100) / 100;
    ref.reviewedBy = adminId;
    ref.adminNote = note ?? ref.adminNote;
    await this.referrals.save(ref);
    this.logger.log(`Referral ${id} reward adjusted to ${ref.rewardAmount} by ${adminId}`);
    return ref;
  }

  /**
   * Admin bulk correction: re-price every referral whose SNAPSHOTTED reward
   * value equals `fromValue` down/up to `toValue`. Fixes a mis-set reward rule
   * that was already frozen onto existing referrals (config changes alone don't
   * touch them). Updates the snapshot `rewardValue` (so any not-yet-unlocked
   * referrals compute the corrected amount later) and the computed
   * `rewardAmount` wherever it currently equals `fromValue`.
   *
   * By default targets rep/sales_rep referrers. Already-paid referrals are
   * INCLUDED — their record is corrected, but note this does NOT reclaim money
   * already disbursed; it only makes the record and liability totals accurate.
   */
  async reconcileRewardValue(
    adminId: string,
    opts: { fromValue: number; toValue: number; referrerTypes?: ReferrerType[]; note?: string },
  ): Promise<{ matched: number; amountsCorrected: number; paidAffected: number }> {
    const referrerTypes: ReferrerType[] =
      opts.referrerTypes?.length ? opts.referrerTypes : ['rep', 'sales_rep'];
    const from = Math.round(opts.fromValue * 100) / 100;
    const to = Math.round(opts.toValue * 100) / 100;

    const candidates = await this.referrals.find({ where: { referrerType: In(referrerTypes) } });
    const matches = candidates.filter((r) => Number(r.rewardValue) === from);

    let amountsCorrected = 0;
    let paidAffected = 0;
    for (const ref of matches) {
      ref.rewardValue = to;
      if (ref.rewardAmount != null && Number(ref.rewardAmount) === from) {
        ref.rewardAmount = to;
        amountsCorrected++;
        if (ref.status === 'paid') paidAffected++;
      }
      ref.reviewedBy = adminId;
      const stamp = `Reward reconciled ${from}→${to}`;
      ref.adminNote = ref.adminNote ? `${ref.adminNote} | ${stamp}` : stamp;
    }
    if (matches.length) await this.referrals.save(matches);

    this.logger.log(
      `Reconciled ${matches.length} referral(s) ${from}→${to} ` +
        `(${amountsCorrected} amounts, ${paidAffected} already-paid) by ${adminId}` +
        (opts.note ? ` — ${opts.note}` : ''),
    );
    return { matched: matches.length, amountsCorrected, paidAffected };
  }

  /** Admin: portfolio summary — counts by status and outstanding reward liability by currency. */
  async summary() {
    const all = await this.referrals.find();
    const byStatus: Record<string, number> = { pending: 0, available: 0, paid: 0, rejected: 0 };
    const outstandingLiability = { cash: 0, wp: 0 }; // owed but unpaid (available)
    const paidToDate = { cash: 0, wp: 0 };
    for (const r of all) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const amt = Number(r.rewardAmount ?? 0);
      if (r.status === 'available') outstandingLiability[r.rewardCurrency] += amt;
      if (r.status === 'paid') paidToDate[r.rewardCurrency] += amt;
    }
    return { total: all.length, byStatus, outstandingLiability, paidToDate };
  }
}
