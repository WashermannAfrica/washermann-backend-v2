import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { CreateConversionRateDto } from './dto';

@Injectable()
export class ConversionRateService {
  private readonly logger = new Logger(ConversionRateService.name);

  constructor(
    @InjectRepository(ConversionRate)
    private rateRepo: Repository<ConversionRate>,
    private configService: ConfigService,
  ) {}

  // ─── Read: current active rate ────────────────────────────────────────────────

  /**
   * Returns the most recently effective rate for a given currency.
   * "Active" means effective_from <= NOW().
   */
  async getActiveRate(currency: string): Promise<ConversionRate> {
    const rate = await this.rateRepo.findOne({
      where: { currency: currency.toUpperCase(), effectiveFrom: LessThanOrEqual(new Date()) },
      order: { effectiveFrom: 'DESC' },
    });

    if (!rate) {
      throw new NotFoundException(
        `No active conversion rate found for currency ${currency}. ` +
        `An admin must configure one before top-ups can be processed.`,
      );
    }

    return rate;
  }

  /**
   * Returns all rates for a currency (history), most recent first.
   */
  async listRates(currency?: string) {
    const where = currency ? { currency: currency.toUpperCase() } : {};
    const rates = await this.rateRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return { data: rates };
  }

  /**
   * Returns the active rates for all currencies (one per currency).
   */
  async listActiveRates() {
    // Raw query to get the latest effective rate per currency
    const rates = await this.rateRepo
      .createQueryBuilder('r')
      .where('r.effective_from <= NOW()')
      .orderBy('r.currency', 'ASC')
      .addOrderBy('r.effective_from', 'DESC')
      .distinctOn(['r.currency'])
      .getMany();

    return { data: rates };
  }

  /**
   * Returns the security question (no auth required — it's a challenge prompt).
   */
  getSecurityChallenge() {
    const question = this.configService.get<string>('topup.securityQuestion') || '';

    if (!question) {
      throw new NotFoundException(
        'RATE_CHANGE_SECURITY_QUESTION is not configured on this server',
      );
    }

    return { data: { question } };
  }

  // ─── Write: admin-only, security-gated ───────────────────────────────────────

  async createRate(adminId: string, dto: CreateConversionRateDto) {
    // 1. Verify the security answer
    await this.verifySecurityAnswer(dto.securityAnswer);

    // 2. Validate currency (only NGN is active for now but the model supports others)
    const currency = dto.currency.toUpperCase();
    const SUPPORTED = ['NGN'];
    if (!SUPPORTED.includes(currency)) {
      throw new BadRequestException(
        `Currency ${currency} is not yet supported. Supported: ${SUPPORTED.join(', ')}`,
      );
    }

    // 3. Effective_from = NOW() + delay (prevents immediate exploitation)
    const delayMinutes = this.configService.get<number>('topup.rateChangeDelayMinutes') ?? 60;
    const effectiveFrom = new Date(Date.now() + delayMinutes * 60 * 1000);

    // 4. Insert (never update existing records)
    const rate = this.rateRepo.create({
      currency,
      pointsPerUnit: dto.pointsPerUnit,
      effectiveFrom,
      createdBy:     adminId,
      notes:         dto.notes ?? null,
    });

    await this.rateRepo.save(rate);

    this.logger.log(
      `ConversionRate created by admin ${adminId}: ` +
      `1 ${currency} = ${dto.pointsPerUnit} WP, effective ${effectiveFrom.toISOString()}`,
    );

    return {
      data: rate,
      message:
        `New rate of ${dto.pointsPerUnit} WP per ${currency} will become active at ` +
        `${effectiveFrom.toISOString()} (${delayMinutes} min delay).`,
    };
  }

  // ─── Utility ─────────────────────────────────────────────────────────────────

  /**
   * Convert a fiat amount (in kobo) to WashPoints using the given rate.
   * Always floors — you never get a fractional WashPoint.
   */
  koboToWashPoints(amountKobo: number, rate: ConversionRate): number {
    // rate.pointsPerUnit = WP per 1 Naira (100 kobo)
    const naira = amountKobo / 100;
    return Math.floor(naira * rate.pointsPerUnit);
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private async verifySecurityAnswer(answer: string): Promise<void> {
    const answerHash = this.configService.get<string>('topup.securityAnswerHash') || '';

    if (!answerHash) {
      throw new NotFoundException(
        'RATE_CHANGE_SECURITY_ANSWER_HASH is not configured on this server',
      );
    }

    const isCorrect = await bcrypt.compare(answer.trim().toLowerCase(), answerHash);

    if (!isCorrect) {
      // Use a generic message — don't hint at what is wrong
      throw new ForbiddenException('Security answer is incorrect');
    }
  }
}
