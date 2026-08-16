import {
  BadRequestException,
  forwardRef,
  Inject,
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
import { CompanyWalletService } from '../companies/company-wallet.service';
import { CompanyLedgerSource } from '../../database/entities/company-ledger-entry.entity';
import { ConversionRateService } from './conversion-rate.service';
import { VaultsService } from '../vaults/vaults.service';
import { InitiateTopupDto } from './dto';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);

  constructor(
    @InjectRepository(PaystackTransaction)
    private txRepo: Repository<PaystackTransaction>,
    @InjectDataSource()
    private dataSource: DataSource,
    @Inject(forwardRef(() => WalletsService))
    private walletsService: WalletsService,
    @Inject(forwardRef(() => VaultsService))
    private vaultsService: VaultsService,
    @Inject(forwardRef(() => CompanyWalletService))
    private companyWalletService: CompanyWalletService,
    private conversionRateService: ConversionRateService,
    private configService: ConfigService,
  ) {}

  // ─── Initiate user top-up ─────────────────────────────────────────────────────

  /**
   * Creates a pending PaystackTransaction using the active vault's rate snapshot.
   * The vault rate is locked at initiation time to prevent exploitation.
   */
  async initiateTopup(
    userId: string,
    userEmail: string,
    dto: InitiateTopupDto,
  ) {
    const currency = (dto.currency ?? 'NGN').toUpperCase();
    const amountKobo = dto.amountNaira * 100;

    const minKobo = this.configService.get<number>('paystack.minTopupKobo') ?? 10_000;
    const maxKobo = this.configService.get<number>('paystack.maxTopupKobo') ?? 50_000_000;

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

    // Use the vault's locked rate — vault is the source of truth
    const vault = await this.vaultsService.getActiveDefaultVault();
    const washPoints = this.conversionRateService.koboToWashPoints(
      amountKobo,
      { pointsPerUnit: vault.conversionRateSnapshot! } as any,
    );

    // Ensure wallet exists before accepting payment
    await this.walletsService.getOrCreateWallet(userId);

    const reference = `wm_${uuidv4().replace(/-/g, '')}`;

    const tx = this.txRepo.create({
      userId,
      reference,
      amountKobo,
      currency,
      conversionRateId: vault.conversionRateId,
      conversionRateSnapshot: vault.conversionRateSnapshot,
      vaultId: vault.id,
      washPointsCredited: null,
      status: TransactionStatus.PENDING,
      metadata: {
        washPointsPreview: washPoints,
        initiatedAt: new Date().toISOString(),
      },
    });
    await this.txRepo.save(tx);

    const { authorizationUrl, accessCode } = await this.paystackInitialize({
      email: userEmail,
      amount: amountKobo,
      reference,
      currency,
      metadata: {
        userId,
        washPoints,
        conversionRate: vault.conversionRateSnapshot,
      },
    });

    this.logger.log(
      `Top-up initiated: ref=${reference} | ₦${dto.amountNaira} | ${washPoints} WP preview | vault=${vault.id}`,
    );

    return {
      data: {
        reference,
        authorizationUrl,
        accessCode,
        amountNaira: dto.amountNaira,
        currency,
        washPointsPreview: washPoints,
        conversionRate: vault.conversionRateSnapshot,
      },
    };
  }

  // ─── Initiate company top-up ──────────────────────────────────────────────────

  async initiateCompanyTopup(
    companyId: string,
    userId: string,
    userEmail: string,
    dto: InitiateTopupDto,
  ) {
    const currency = (dto.currency ?? 'NGN').toUpperCase();
    const amountKobo = dto.amountNaira * 100;

    const minKobo = this.configService.get<number>('paystack.minTopupKobo') ?? 10_000;
    const maxKobo = this.configService.get<number>('paystack.maxTopupKobo') ?? 50_000_000;

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

    const vault = await this.vaultsService.getActiveDefaultVault();
    const washPoints = this.conversionRateService.koboToWashPoints(
      amountKobo,
      { pointsPerUnit: vault.conversionRateSnapshot! } as any,
    );

    // Ensure company wallet exists
    await this.companyWalletService.getOrCreateWallet(companyId);

    const reference = `wmc_${uuidv4().replace(/-/g, '')}`;

    const tx = this.txRepo.create({
      userId,
      reference,
      amountKobo,
      currency,
      conversionRateId: vault.conversionRateId,
      conversionRateSnapshot: vault.conversionRateSnapshot,
      vaultId: vault.id,
      companyId,
      washPointsCredited: null,
      status: TransactionStatus.PENDING,
      metadata: {
        washPointsPreview: washPoints,
        initiatedAt: new Date().toISOString(),
        companyId,
      },
    });
    await this.txRepo.save(tx);

    const { authorizationUrl, accessCode } = await this.paystackInitialize({
      email: userEmail,
      amount: amountKobo,
      reference,
      currency,
      metadata: {
        userId,
        companyId,
        washPoints,
        conversionRate: vault.conversionRateSnapshot,
      },
    });

    this.logger.log(
      `Company top-up initiated: ref=${reference} | ₦${dto.amountNaira} | ${washPoints} WP preview | company=${companyId} | vault=${vault.id}`,
    );

    return {
      data: {
        reference,
        authorizationUrl,
        accessCode,
        amountNaira: dto.amountNaira,
        currency,
        washPointsPreview: washPoints,
        conversionRate: vault.conversionRateSnapshot,
        companyId,
      },
    };
  }

  // ─── Verify (mobile fallback) ─────────────────────────────────────────────────

  async verifyTopup(userId: string, reference: string) {
    const tx = await this.txRepo.findOne({
      where: { reference, userId },
    });
    if (!tx) {
      throw new BadRequestException('Transaction not found');
    }

    if (tx.status !== TransactionStatus.PENDING) {
      return { data: this.sanitizeTx(tx) };
    }

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

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
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
      const tx = await qr.manager.findOne(PaystackTransaction, {
        where: { reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!tx) {
        this.logger.warn(`charge.success for unknown reference: ${reference}`);
        await qr.rollbackTransaction();
        return;
      }

      if (tx.status !== TransactionStatus.PENDING) {
        this.logger.log(
          `charge.success already processed for ref: ${reference} (status=${tx.status})`,
        );
        await qr.rollbackTransaction();
        return;
      }

      tx.status = TransactionStatus.SUCCESS;
      tx.channel = (data.channel as string) ?? null;
      tx.paystackReference = (data.id as string)?.toString() ?? null;
      tx.webhookData = data;
      await qr.manager.save(PaystackTransaction, tx);

      await qr.commitTransaction();

      // Compute WP from frozen snapshot
      const washPoints = this.conversionRateService.koboToWashPoints(
        tx.amountKobo,
        { pointsPerUnit: tx.conversionRateSnapshot! } as any,
      );

      if (tx.companyId) {
        // Company wallet top-up
        await this.companyWalletService.credit({
          companyId: tx.companyId,
          amount: washPoints,
          source: CompanyLedgerSource.TOPUP,
          fiatAmountKobo: tx.amountKobo,
          description: `Company WP purchase: ₦${tx.amountKobo / 100} → ${washPoints} WP`,
          metadata: { paystackReference: tx.paystackReference, reference: tx.reference },
        });
      } else {
        // User wallet top-up
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
      }

      // Debit vault if vaultId present
      if (tx.vaultId) {
        await this.vaultsService.debitVault(tx.vaultId, washPoints);
      }

      await this.txRepo.update(tx.id, { washPointsCredited: washPoints });

      this.logger.log(
        `charge.success processed: ref=${reference} | ${washPoints} WP | user=${tx.userId} | company=${tx.companyId ?? 'n/a'} | vault=${tx.vaultId ?? 'n/a'}`,
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

    if (tx.companyId) {
      await this.companyWalletService.credit({
        companyId: tx.companyId,
        amount: washPoints,
        source: CompanyLedgerSource.TOPUP,
        fiatAmountKobo: tx.amountKobo,
        description: `Company WP purchase: ₦${tx.amountKobo / 100} → ${washPoints} WP`,
        metadata: { paystackReference: tx.paystackReference, reference: tx.reference },
      });
    } else {
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
    }

    if (tx.vaultId) {
      await this.vaultsService.debitVault(tx.vaultId, washPoints);
    }

    await this.txRepo.update(tx.id, { washPointsCredited: washPoints });
  }

  // ─── Private: Paystack API calls ──────────────────────────────────────────────

  // ─── Bank list (for payout account entry) ─────────────────────────────────────

  private banksCache: { at: number; banks: Array<{ name: string; code: string }> } | null = null;
  private static readonly BANKS_TTL_MS = 24 * 60 * 60 * 1000; // banks rarely change

  /** Nigerian bank list from Paystack, cached 24h. Used to populate payout bank pickers. */
  async listBanks(): Promise<Array<{ name: string; code: string }>> {
    if (this.banksCache && Date.now() - this.banksCache.at < PaystackService.BANKS_TTL_MS) {
      return this.banksCache.banks;
    }
    const secretKey = this.configService.get<string>('paystack.secretKey');
    const baseUrl = this.configService.get<string>('paystack.baseUrl');
    try {
      const res = await axios.get(`${baseUrl}/bank?country=nigeria&currency=NGN`, {
        headers: { Authorization: `Bearer ${secretKey}` },
        timeout: 10_000,
      });
      const banks: Array<{ name: string; code: string }> = (res.data?.data ?? [])
        .map((b: { name: string; code: string }) => ({ name: b.name, code: b.code }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
      this.banksCache = { at: Date.now(), banks };
      return banks;
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      this.logger.error(`Paystack bank list failed: ${message}`);
      // Serve a stale cache if we have one, rather than breaking the payout form.
      if (this.banksCache) return this.banksCache.banks;
      throw new BadRequestException(`Could not load bank list: ${message}`);
    }
  }

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

  // ─── Paystack Transfer (vendor payouts) ─────────────────────────────────────

  /**
   * Create a Paystack transfer recipient.
   * Must be done once per bank account before initiating a transfer.
   * Returns a recipient code (e.g. RCP_xxxx) that is stable for the same account.
   */
  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<string> {
    const secretKey = this.configService.get<string>('paystack.secretKey');
    const baseUrl   = this.configService.get<string>('paystack.baseUrl');

    try {
      const res = await axios.post(
        `${baseUrl}/transferrecipient`,
        {
          type:           'nuban',
          name:           params.name,
          account_number: params.accountNumber,
          bank_code:      params.bankCode,
          currency:       'NGN',
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10_000,
        },
      );
      return res.data.data.recipient_code as string;
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      this.logger.error(`Paystack createTransferRecipient failed: ${message}`);
      throw new BadRequestException(`Payment gateway error: ${message}`);
    }
  }

  /**
   * Initiate a Paystack transfer to a recipient.
   * Amount is in Naira (we convert to kobo internally).
   * Returns the transfer code and initial status.
   */
  async initiateTransfer(params: {
    amountNaira: number;
    recipientCode: string;
    reason: string;
    reference: string;
  }): Promise<{ transferCode: string; status: string }> {
    const secretKey = this.configService.get<string>('paystack.secretKey');
    const baseUrl   = this.configService.get<string>('paystack.baseUrl');

    const amountKobo = Math.round(params.amountNaira * 100);

    try {
      const res = await axios.post(
        `${baseUrl}/transfer`,
        {
          source:    'balance',
          amount:    amountKobo,
          recipient: params.recipientCode,
          reason:    params.reason,
          reference: params.reference,
        },
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );
      const { transfer_code, status } = res.data.data;
      return { transferCode: transfer_code as string, status: status as string };
    } catch (err: any) {
      const message = err?.response?.data?.message ?? err?.message ?? 'Paystack error';
      this.logger.error(`Paystack initiateTransfer failed: ${message}`);
      throw new BadRequestException(`Payment gateway error: ${message}`);
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
