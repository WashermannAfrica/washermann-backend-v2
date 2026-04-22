import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PaystackTransaction } from '../../database/entities/paystack-transaction.entity';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { WalletsService } from '../wallets/wallets.service';
import { ConversionRateService } from './conversion-rate.service';
import { InitiateTopupDto } from './dto';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(
    @InjectRepository(PaystackTransaction)
    private txRepo: Repository<PaystackTransaction>,
    @InjectDataSource()
    private dataSource: DataSource,
    private walletsService: WalletsService,
    private conversionRateService: ConversionRateService,
    private configService: ConfigService,
  ) {}

  // ─── Initiate top-up ─────────────────────────────────────────────────────────

  /**
   * Creates a pending PaystackTransaction with the conversion rate locked at
   * initiation time, then calls Paystack to get the authorization URL.
   */
  async initiateTopup(
    userId: string,
    userEmail: string,
    dto: InitiateTopupDto,
  ) {
    const currency = (dto.currency ?? 'NGN').toUpperCase();
    const amountKobo = dto.amountNaira * 100; // Naira → kobo

    // Validate amount bounds
    const minKobo =
      this.configService.get<number>('paystack.minTopupKobo') ?? 10_000;
    const maxKobo =
      this.configService.get<number>('paystack.maxTopupKobo') ?? 50_000_000;

    if (amountKobo < minKobo) {
      throw new BadRequestException(
        `Minimum top-up is ₦${minKobo / 100}. You submitted ₦${dto.amountNaira}.`,
      );
    }
    if (amountKobo > maxKobo) {
      throw new BadRequestException(
        `Maximum top-up is ₦${maxKobo / 100}. You submitted ₦${dto.amountNaira}.`,
      );
    }

    // Lock the current rate NOW (before payment) — prevents post-change exploitation
    const rate = await this.conversionRateService.getActiveRate(currency);
    const washPoints = this.conversionRateService.koboToWashPoints(
      amountKobo,
      rate,
    );

    // Ensure wallet exists before we accept payment
    await this.walletsService.getOrCreateWallet(userId);

    // Generate our reference (wm_ prefix makes it easy to identify in Paystack dashboard)
    const reference = `wm_${uuidv4().replace(/-/g, '')}`;

    // Persist the pending transaction with the locked rate
    const tx = this.txRepo.create({
      userId,
      reference,
      amountKobo,
      currency,
      conversionRateId: rate.id,
      conversionRateSnapshot: rate.pointsPerUnit,
      washPointsCredited: null,
      status: TransactionStatus.PENDING,
      metadata: {
        washPointsPreview: washPoints,
        initiatedAt: new Date().toISOString(),
      },
    });
    await this.txRepo.save(tx);

    // Call Paystack Initialize Transaction
    const { authorizationUrl, accessCode } = await this.paystackInitialize({
      email: userEmail,
      amount: amountKobo,
      reference,
      currency,
      metadata: {
        userId,
        washPoints,
        conversionRate: rate.pointsPerUnit,
      },
    });

    this.logger.log(
      `Top-up initiated: ref=${reference} | ₦${dto.amountNaira} | ${washPoints} WP preview`,
    );

    return {
      data: {
        reference,
        authorizationUrl,
        accessCode,
        amountNaira: dto.amountNaira,
        currency,
        washPointsPreview: washPoints,
        conversionRate: rate.pointsPerUnit,
        rateEffectiveFrom: rate.effectiveFrom,
      },
    };
  }

  // ─── Verify (mobile fallback) ─────────────────────────────────────────────────

  /**
   * Polls Paystack directly. If the transaction is successful and not yet
   * processed locally, credits the wallet (same path as the webhook).
   */
  async verifyTopup(userId: string, reference: string) {
    const tx = await this.txRepo.findOne({
      where: { reference, userId },
    });
    if (!tx) {
      throw new BadRequestException('Transaction not found');
    }

    // If already processed, return current state without calling Paystack
    if (tx.status !== TransactionStatus.PENDING) {
      return { data: this.sanitizeTx(tx) };
    }

    // Call Paystack Verify
    const paystackData = await this.paystackVerify(reference);

    if (paystackData.status === 'success') {
      await this.processSuccessfulPayment(tx, paystackData);
      const updated = await this.txRepo.findOne({ where: { reference } });
      return { data: this.sanitizeTx(updated!) };
    }

    if (
      paystackData.status === 'failed' ||
      paystackData.status === 'abandoned'
    ) {
      tx.status = TransactionStatus.FAILED;
      tx.webhookData = paystackData;
      await this.txRepo.save(tx);
    }

    return { data: this.sanitizeTx(tx) };
  }

  // ─── Webhook processor ───────────────────────────────────────────────────────

  /**
   * Entry point called by WebhooksController.
   * rawBody MUST be the original Buffer before any JSON parsing — required for
   * Paystack HMAC-SHA512 signature verification.
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    // 1. Verify HMAC signature — reject immediately if invalid
    this.verifyPaystackSignature(rawBody, signature);

    const payload = JSON.parse(rawBody.toString('utf-8'));
    const event = payload?.event as string;

    this.logger.log(`Paystack webhook received: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.onChargeSuccess(payload.data);
        break;
      case 'charge.failed':
        await this.onChargeFailed(payload.data);
        break;
      default:
        // Log and ignore unhandled events (transfers, refunds handled in future phases)
        this.logger.log(`Unhandled Paystack event: ${event}`);
    }
  }

  // ─── Private: webhook event handlers ─────────────────────────────────────────

  private async onChargeSuccess(data: Record<string, unknown>): Promise<void> {
    const reference = data.reference as string;
    if (!reference) return;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock the transaction row — prevents duplicate webhook processing
      const tx = await qr.manager.findOne(PaystackTransaction, {
        where: { reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tx) {
        this.logger.warn(`charge.success for unknown reference: ${reference}`);
        await qr.rollbackTransaction();
        return;
      }

      // Idempotency guard — only process if still PENDING
      if (tx.status !== TransactionStatus.PENDING) {
        this.logger.log(
          `charge.success already processed for ref: ${reference} (status=${tx.status})`,
        );
        await qr.rollbackTransaction();
        return;
      }

      // Update transaction record
      tx.status = TransactionStatus.SUCCESS;
      tx.channel = (data.channel as string) ?? null;
      tx.paystackReference = (data.id as string)?.toString() ?? null;
      tx.webhookData = data;
      await qr.manager.save(PaystackTransaction, tx);

      await qr.commitTransaction();

      // Credit wallet OUTSIDE the transaction lock (walletsService has its own lock)
      const washPoints = this.conversionRateService.koboToWashPoints(
        tx.amountKobo,
        { pointsPerUnit: tx.conversionRateSnapshot! } as any,
      );

      await this.walletsService.credit({
        userId: tx.userId,
        amount: washPoints,
        source: LedgerSource.TOPUP,
        reference: tx.reference,
        description: `Top-up: ₦${tx.amountKobo / 100} → ${washPoints} WP`,
        conversionRateId: tx.conversionRateId,
        conversionRateSnapshot: tx.conversionRateSnapshot,
        fiatAmountKobo: tx.amountKobo,
        fiatCurrency: tx.currency,
        metadata: { paystackReference: tx.paystackReference },
      });

      // Record WP credited on the transaction (for reporting)
      await this.txRepo.update(tx.id, { washPointsCredited: washPoints });

      this.logger.log(
        `charge.success processed: ref=${reference} | ${washPoints} WP → user ${tx.userId}`,
      );
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Error processing charge.success for ref ${reference}: ${(err as Error).message}`,
      );
      throw err;
    } finally {
      await qr.release();
    }
  }

  private async onChargeFailed(data: Record<string, unknown>): Promise<void> {
    const reference = data.reference as string;
    if (!reference) return;

    const tx = await this.txRepo.findOne({ where: { reference } });
    if (!tx || tx.status !== TransactionStatus.PENDING) return;

    tx.status = TransactionStatus.FAILED;
    tx.webhookData = data;
    await this.txRepo.save(tx);

    this.logger.warn(`charge.failed for ref=${reference} | user=${tx.userId}`);
  }

  private async processSuccessfulPayment(
    tx: PaystackTransaction,
    paystackData: Record<string, unknown>,
  ): Promise<void> {
    // Reuse the same logic as the webhook handler but without a separate DB tx
    // (the verify endpoint is already outside a transaction context)
    if (tx.status !== TransactionStatus.PENDING) return;

    tx.status = TransactionStatus.SUCCESS;
    tx.channel = (paystackData.channel as string) ?? null;
    tx.paystackReference = (paystackData.id as string)?.toString() ?? null;
    tx.webhookData = paystackData;
    await this.txRepo.save(tx);

    const washPoints = this.conversionRateService.koboToWashPoints(
      tx.amountKobo,
      { pointsPerUnit: tx.conversionRateSnapshot! } as any,
    );

    await this.walletsService.credit({
      userId: tx.userId,
      amount: washPoints,
      source: LedgerSource.TOPUP,
      reference: tx.reference,
      description: `Top-up: ₦${tx.amountKobo / 100} → ${washPoints} WP`,
      conversionRateId: tx.conversionRateId,
      conversionRateSnapshot: tx.conversionRateSnapshot,
      fiatAmountKobo: tx.amountKobo,
      fiatCurrency: tx.currency,
      metadata: { paystackReference: tx.paystackReference },
    });

    await this.txRepo.update(tx.id, { washPointsCredited: washPoints });
  }

  // ─── Private: Paystack API calls ──────────────────────────────────────────────

  private async paystackInitialize(params: {
    email: string;
    amount: number;
    reference: string;
    currency: string;
    metadata: Record<string, unknown>;
  }): Promise<{ authorizationUrl: string; accessCode: string }> {
    const secretKey = this.configService.get<string>('paystack.secretKey');
    const baseUrl = this.configService.get<string>('paystack.baseUrl');

    try {
      const res = await axios.post(
        `${baseUrl}/transaction/initialize`,
        {
          email: params.email,
          amount: params.amount,
          reference: params.reference,
          currency: params.currency,
          metadata: params.metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );

      const { authorization_url, access_code } = res.data.data;
      return { authorizationUrl: authorization_url, accessCode: access_code };
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      this.logger.error(`Paystack initialize failed: ${message}`);
      throw new BadRequestException(`Payment gateway error: ${message}`);
    }
  }

  private async paystackVerify(
    reference: string,
  ): Promise<Record<string, unknown>> {
    const secretKey = this.configService.get<string>('paystack.secretKey');
    const baseUrl = this.configService.get<string>('paystack.baseUrl');

    try {
      const res = await axios.get(
        `${baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          timeout: 10_000,
        },
      );
      return res.data.data;
    } catch (err: any) {
      const message =
        err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      this.logger.error(`Paystack verify failed: ${message}`);
      throw new BadRequestException(`Payment gateway error: ${message}`);
    }
  }

  // ─── Private: webhook signature ──────────────────────────────────────────────

  /**
   * Verifies the x-paystack-signature header against HMAC-SHA512 of the raw
   * request body using the Paystack webhook secret.
   *
   * Must use the RAW body bytes — not JSON.stringify of the parsed object.
   */
  private verifyPaystackSignature(rawBody: Buffer, signature: string): void {
    const secret = this.configService.get<string>('paystack.webhookSecret');

    if (!secret) {
      this.logger.warn(
        'PAYSTACK_WEBHOOK_SECRET not set — skipping signature verification (INSECURE)',
      );
      return;
    }
    if (!signature) {
      throw new UnauthorizedException('Missing Paystack webhook signature');
    }

    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    const valid =
      sigBuffer.length === expectedBuffer.length &&
      timingSafeEqual(sigBuffer, expectedBuffer);

    if (!valid) {
      this.logger.warn(
        'Paystack webhook signature mismatch — request rejected',
      );
      throw new UnauthorizedException('Invalid Paystack webhook signature');
    }
  }

  // ─── Private: helpers ────────────────────────────────────────────────────────

  private sanitizeTx(tx: PaystackTransaction) {
    return {
      id: tx.id,
      reference: tx.reference,
      amountKobo: tx.amountKobo,
      amountNaira: tx.amountKobo / 100,
      currency: tx.currency,
      conversionRateSnapshot: tx.conversionRateSnapshot,
      washPointsCredited: tx.washPointsCredited,
      status: tx.status,
      channel: tx.channel,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  }
}
