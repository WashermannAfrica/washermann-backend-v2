import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { RateConfig } from '../../database/entities/rate-config.entity';
import { RateEpoch, RateEpochTrigger } from '../../database/entities/rate-epoch.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { ComputeRateDto } from './dto/compute-rate.dto';
import { UpdateRateConfigDto } from './dto/update-rate-config.dto';

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const r8 = (x: number) => Math.round(x * 1e8) / 1e8;

@Injectable()
export class RateEngineService implements OnModuleInit {
  private readonly logger = new Logger(RateEngineService.name);

  constructor(
    @InjectRepository(RateConfig) private readonly configRepo: Repository<RateConfig>,
    @InjectRepository(RateEpoch) private readonly epochs: Repository<RateEpoch>,
    @InjectRepository(ConversionRate) private readonly rates: Repository<ConversionRate>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    try {
      await this.getConfig();
    } catch (err) {
      this.logger.warn(`Rate config init skipped (${(err as Error).message})`);
    }
  }

  // ─── Config (singleton) ───────────────────────────────────────────────────────
  async getConfig(): Promise<RateConfig> {
    let cfg = await this.configRepo.findOne({ where: {}, order: { createdAt: 'ASC' } });
    if (!cfg) {
      cfg = await this.configRepo.save(
        this.configRepo.create({
          vBase: 6.86,
          currentV: 6.86,
          lastSmoothedIndex: 1,
          alpha: 0.2,
          capPct: 5,
          deadbandPct: 1,
          stepNaira: 0.005,
          buySpread: 0,
          payoutSpread: 0,
          formulaVersion: 1,
          weights: { fx: 0.4, diesel: 0.2, vendor: 0.4 },
          baselines: { fx: 1400, diesel: 1300, vendor: 4500 },
        }),
      );
      this.logger.log('Seeded rate_config (V_base=₦6.86, SmoothedIndex=1)');
    }
    return cfg;
  }

  async updateConfig(dto: UpdateRateConfigDto, adminId: string): Promise<RateConfig> {
    const cfg = await this.getConfig();
    if (dto.weights) {
      const sum = dto.weights.fx + dto.weights.diesel + dto.weights.vendor;
      if (Math.abs(sum - 1) > 1e-6) throw new BadRequestException('Weights must sum to 1');
      cfg.weights = dto.weights;
    }
    if (dto.baselines) cfg.baselines = dto.baselines;
    if (dto.alpha != null) cfg.alpha = dto.alpha;
    if (dto.capPct != null) cfg.capPct = dto.capPct;
    if (dto.deadbandPct != null) cfg.deadbandPct = dto.deadbandPct;
    if (dto.stepNaira != null) cfg.stepNaira = dto.stepNaira;
    if (dto.buySpread != null) cfg.buySpread = dto.buySpread;
    if (dto.payoutSpread != null) cfg.payoutSpread = dto.payoutSpread;
    cfg.formulaVersion = (cfg.formulaVersion ?? 1) + (dto.weights || dto.baselines ? 1 : 0);
    cfg.updatedBy = adminId;
    return this.configRepo.save(cfg);
  }

  // ─── Compute (always logged, never applied) ───────────────────────────────────
  async compute(dto: ComputeRateDto, userId: string, trigger: RateEpochTrigger = 'manual'): Promise<RateEpoch> {
    const cfg = await this.getConfig();
    const weights = cfg.weights;
    const baselines = cfg.baselines;
    const wsum = weights.fx + weights.diesel + weights.vendor;
    if (Math.abs(wsum - 1) > 1e-6) throw new BadRequestException('Configured weights must sum to 1');

    const inputs = { fx: dto.fx, diesel: dto.diesel, vendor: dto.vendor };
    const factors = {
      fx: inputs.fx / baselines.fx,
      diesel: inputs.diesel / baselines.diesel,
      vendor: inputs.vendor / baselines.vendor,
    };
    // CostIndex = ∏ factor_i ^ w_i = exp( Σ w_i · ln(factor_i) )
    const lnSum =
      weights.fx * Math.log(factors.fx) +
      weights.diesel * Math.log(factors.diesel) +
      weights.vendor * Math.log(factors.vendor);
    const costIndex = Math.exp(lnSum);

    const alpha = Number(cfg.alpha);
    const prevSmoothed = Number(cfg.lastSmoothedIndex);
    const smoothedIndex = alpha * costIndex + (1 - alpha) * prevSmoothed; // EMA

    const vBase = Number(cfg.vBase);
    const prevV = Number(cfg.currentV);
    const targetV = vBase * smoothedIndex;

    const cap = Number(cfg.capPct) / 100;
    const lo = prevV * (1 - cap);
    const hi = prevV * (1 + cap);
    const vCapped = Math.min(hi, Math.max(lo, targetV));
    const capApplied = Math.abs(vCapped - targetV) > 1e-9;

    const deadband = Number(cfg.deadbandPct) / 100;
    const deadbandHeld = prevV > 0 && Math.abs(vCapped - prevV) / prevV < deadband;
    const vNew = deadbandHeld ? prevV : vCapped;

    const step = Number(cfg.stepNaira);
    const vPublished = step > 0 ? Math.round(vNew / step) * step : vNew;

    const buySpread = Number(cfg.buySpread);
    const payoutSpread = Number(cfg.payoutSpread);
    const pointsPerUnit = 1 / (vPublished * (1 + buySpread));
    const payoutRate = vPublished * (1 - payoutSpread);

    const data = {
      formulaVersion: cfg.formulaVersion,
      trigger: dto.trigger ?? trigger,
      inputs,
      baselines,
      weights,
      factors: { fx: r8(factors.fx), diesel: r8(factors.diesel), vendor: r8(factors.vendor) },
      costIndex: r8(costIndex),
      prevSmoothedIndex: r8(prevSmoothed),
      smoothedIndex: r8(smoothedIndex),
      vBase: r4(vBase),
      prevV: r4(prevV),
      targetV: r4(targetV),
      vCapped: r4(vCapped),
      vNew: r4(vNew),
      vPublished: r4(vPublished),
      capApplied,
      deadbandHeld,
      buySpread: r4(buySpread),
      payoutSpread: r4(payoutSpread),
      pointsPerUnit: r6(pointsPerUnit),
      payoutRate: r4(payoutRate),
      status: 'proposed' as const,
      proposedBy: userId,
    };
    const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    const epoch = await this.epochs.save(this.epochs.create({ ...data, hash }));
    this.logger.log(
      `Rate epoch ${epoch.id} computed (${data.trigger}): V ${prevV} → ${data.vPublished}` +
        `${capApplied ? ' [capped]' : ''}${deadbandHeld ? ' [deadband-held]' : ''} (proposed)`,
    );
    return epoch;
  }

  // ─── Decision (apply / reject) ────────────────────────────────────────────────
  async approve(epochId: string, adminId: string, note?: string): Promise<RateEpoch> {
    const epoch = await this.epochs.findOne({ where: { id: epochId } });
    if (!epoch) throw new NotFoundException('Rate epoch not found');
    if (epoch.status !== 'proposed') throw new BadRequestException(`Epoch is ${epoch.status}, not proposed`);

    const cfg = await this.getConfig();
    // Staleness guard: the epoch must have been computed against the current V.
    if (Math.abs(Number(epoch.prevV) - Number(cfg.currentV)) > 1e-9) {
      throw new BadRequestException('Stale epoch — V has changed since it was computed. Recompute first.');
    }

    await this.dataSource.transaction(async (m) => {
      const changed = Math.abs(Number(epoch.vPublished) - Number(epoch.prevV)) > 1e-9;
      let appliedId: string | null = null;
      if (changed) {
        const rate = m.create(ConversionRate, {
          currency: 'NGN',
          pointsPerUnit: Number(epoch.pointsPerUnit),
          effectiveFrom: new Date(),
          createdBy: adminId,
          notes: `Rate epoch ${epoch.id} (V=${epoch.vPublished})`,
        });
        await m.save(rate);
        appliedId = rate.id;

        // Update the payout leg on the singleton platform_config.
        const pc = await m.findOne(PlatformConfig, { where: {}, order: { createdAt: 'ASC' } });
        if (pc) {
          pc.payoutRateNairaPerWP = Number(epoch.payoutRate);
          pc.updatedBy = adminId;
          await m.save(pc);
        }
      }

      // Advance EMA state + current V (smoothed index advances even on a deadband hold).
      cfg.currentV = Number(epoch.vPublished);
      cfg.lastSmoothedIndex = Number(epoch.smoothedIndex);
      cfg.lastApprovedAt = new Date();
      cfg.updatedBy = adminId;
      await m.save(cfg);

      epoch.status = 'approved';
      epoch.decidedBy = adminId;
      epoch.decidedAt = new Date();
      epoch.note = note ?? null;
      epoch.appliedConversionRateId = appliedId;
      await m.save(epoch);
    });

    this.logger.log(
      `Rate epoch ${epoch.id} APPROVED by ${adminId} → V=${epoch.vPublished}, ppu=${epoch.pointsPerUnit}, payout=${epoch.payoutRate}`,
    );
    return epoch;
  }

  async reject(epochId: string, adminId: string, note?: string): Promise<RateEpoch> {
    const epoch = await this.epochs.findOne({ where: { id: epochId } });
    if (!epoch) throw new NotFoundException('Rate epoch not found');
    if (epoch.status !== 'proposed') throw new BadRequestException(`Epoch is ${epoch.status}, not proposed`);
    epoch.status = 'rejected';
    epoch.decidedBy = adminId;
    epoch.decidedAt = new Date();
    epoch.note = note ?? null;
    await this.epochs.save(epoch);
    this.logger.log(`Rate epoch ${epoch.id} REJECTED by ${adminId} (logged, not applied)`);
    return epoch;
  }

  // ─── Reads ────────────────────────────────────────────────────────────────────
  listEpochs(status?: string) {
    return this.epochs.find({ where: status ? { status: status as any } : {}, order: { createdAt: 'DESC' } });
  }

  async getEpoch(id: string) {
    const epoch = await this.epochs.findOne({ where: { id } });
    if (!epoch) throw new NotFoundException('Rate epoch not found');
    return epoch;
  }

  // ─── Review prompt (the scheduled trigger only NOTIFIES; admin inputs values) ─
  async notifyReview(trigger: RateEpochTrigger = 'scheduled') {
    const cfg = await this.getConfig();
    const res = await this.notifications.sendRateReviewPrompt(trigger);
    cfg.lastPromptedAt = new Date();
    await this.configRepo.save(cfg);
    return res;
  }

  /** Monthly: prompt admins to review V. Never changes the rate by itself. */
  @Cron('0 9 1 * *')
  async monthlyReviewPrompt() {
    try {
      await this.notifyReview('scheduled');
    } catch (err) {
      this.logger.warn(`Monthly rate-review prompt failed: ${(err as Error).message}`);
    }
  }
}
