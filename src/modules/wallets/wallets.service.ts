import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Wallet } from '../../database/entities/wallet.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { PaystackTransaction } from '../../database/entities/paystack-transaction.entity';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { AdminCreditDto, AdminDebitDto } from './dto';

// ── Internal credit/debit options ────────────────────────────────────────────

export interface CreditOptions {
  userId:                  string;
  amount:                  number;          // WashPoints — positive integer
  source:                  LedgerSource;
  reference?:              string | null;
  description:             string;
  conversionRateId?:       string | null;
  conversionRateSnapshot?: number | null;
  fiatAmountKobo?:         number | null;
  fiatCurrency?:           string | null;
  metadata?:               Record<string, unknown> | null;
}

export interface DebitOptions {
  userId:      string;
  amount:      number;
  source:      LedgerSource;
  reference?:  string | null;
  description: string;
  metadata?:   Record<string, unknown> | null;
}

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(LedgerEntry)
    private ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(PaystackTransaction)
    private txRepo: Repository<PaystackTransaction>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  // ─── Public: get or create ────────────────────────────────────────────────────

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    let wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      wallet = this.walletRepo.create({ userId, balance: 0, isActive: true });
      await this.walletRepo.save(wallet);
      this.logger.log(`Wallet created for user ${userId}`);
    }
    return wallet;
  }

  // ─── Public: read operations ──────────────────────────────────────────────────

  async getWallet(userId: string) {
    const wallet = await this.getOrCreateWallet(userId);

    // Derive total fiat spent from successful Paystack transactions (no extra column needed)
    const totalFiatResult = await this.txRepo
      .createQueryBuilder('tx')
      .select('SUM(tx.amount_kobo)', 'total')
      .where('tx.user_id = :userId', { userId })
      .andWhere('tx.status = :status', { status: 'success' })
      .getRawOne<{ total: string | null }>();

    const totalFiatKobo = parseInt(totalFiatResult?.total ?? '0', 10);

    return {
      data: {
        id:           wallet.id,
        balance:      wallet.balance,               // WashPoints
        isActive:     wallet.isActive,
        totalFiatSpent: {
          currency:  'NGN',
          kobo:      totalFiatKobo,
          naira:     totalFiatKobo / 100,           // display helper
        },
        createdAt:    wallet.createdAt,
        updatedAt:    wallet.updatedAt,
      },
    };
  }

  async getLedger(userId: string, page = 1, limit = 20) {
    const wallet = await this.getOrCreateWallet(userId);

    const [entries, total] = await this.ledgerRepo.findAndCount({
      where:  { walletId: wallet.id },
      order:  { createdAt: 'DESC' },
      skip:   (page - 1) * limit,
      take:   limit,
    });

    return {
      data: entries,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Internal: atomic credit (used by PaystackService & BenefitsService) ─────

  /**
   * Atomically credit WashPoints to a wallet.
   * Acquires a pessimistic write lock on the wallet row before writing.
   * Rolls back on any error.
   */
  async credit(opts: CreditOptions): Promise<LedgerEntry> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock the wallet row — prevents concurrent writes
      const wallet = await qr.manager.findOne(Wallet, {
        where: { userId: opts.userId },
        lock:  { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${opts.userId}`);
      }
      if (!wallet.isActive) {
        throw new BadRequestException('Wallet is inactive');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter  = balanceBefore + opts.amount;

      // Sanity: amount must be a positive integer
      if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
        throw new BadRequestException('Credit amount must be a positive integer');
      }

      // Write ledger entry (immutable)
      const entry = qr.manager.create(LedgerEntry, {
        walletId:               wallet.id,
        userId:                 opts.userId,
        type:                   'credit',
        amount:                 opts.amount,
        balanceBefore,
        balanceAfter,
        source:                 opts.source,
        reference:              opts.reference     ?? null,
        description:            opts.description,
        conversionRateId:       opts.conversionRateId    ?? null,
        conversionRateSnapshot: opts.conversionRateSnapshot ?? null,
        fiatAmountKobo:         opts.fiatAmountKobo  ?? null,
        fiatCurrency:           opts.fiatCurrency    ?? null,
        metadata:               opts.metadata        ?? null,
      });
      await qr.manager.save(LedgerEntry, entry);

      // Update wallet balance
      wallet.balance = balanceAfter;
      await qr.manager.save(Wallet, wallet);

      await qr.commitTransaction();
      this.logger.log(
        `CREDIT ${opts.amount} WP → user ${opts.userId} | src=${opts.source} | ref=${opts.reference}`,
      );
      return entry;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Internal: atomic debit ───────────────────────────────────────────────────

  /**
   * Atomically debit WashPoints from a wallet.
   * Checks balance sufficiency inside the lock — no window for race conditions.
   */
  async debit(opts: DebitOptions): Promise<LedgerEntry> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const wallet = await qr.manager.findOne(Wallet, {
        where: { userId: opts.userId },
        lock:  { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${opts.userId}`);
      }
      if (!wallet.isActive) {
        throw new BadRequestException('Wallet is inactive');
      }
      if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
        throw new BadRequestException('Debit amount must be a positive integer');
      }
      if (wallet.balance < opts.amount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${wallet.balance} WP, required: ${opts.amount} WP`,
        );
      }

      const balanceBefore = wallet.balance;
      const balanceAfter  = balanceBefore - opts.amount;

      const entry = qr.manager.create(LedgerEntry, {
        walletId:     wallet.id,
        userId:       opts.userId,
        type:         'debit',
        amount:       opts.amount,
        balanceBefore,
        balanceAfter,
        source:       opts.source,
        reference:    opts.reference  ?? null,
        description:  opts.description,
        metadata:     opts.metadata   ?? null,
      });
      await qr.manager.save(LedgerEntry, entry);

      wallet.balance = balanceAfter;
      await qr.manager.save(Wallet, wallet);

      await qr.commitTransaction();
      this.logger.log(
        `DEBIT ${opts.amount} WP ← user ${opts.userId} | src=${opts.source} | ref=${opts.reference}`,
      );
      return entry;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Admin: manual credit / debit ────────────────────────────────────────────

  async adminCredit(targetUserId: string, dto: AdminCreditDto) {
    await this.getOrCreateWallet(targetUserId);

    const entry = await this.credit({
      userId:      targetUserId,
      amount:      dto.amount,
      source:      LedgerSource.ADMIN_CREDIT,
      description: dto.description,
    });

    return { data: entry, message: `${dto.amount} WP credited to user ${targetUserId}` };
  }

  async adminDebit(targetUserId: string, dto: AdminDebitDto) {
    const entry = await this.debit({
      userId:      targetUserId,
      amount:      dto.amount,
      source:      LedgerSource.ADMIN_DEBIT,
      description: dto.description,
    });

    return { data: entry, message: `${dto.amount} WP debited from user ${targetUserId}` };
  }

  // ─── Admin: view any user's wallet ───────────────────────────────────────────

  async getWalletByUserId(targetUserId: string) {
    const wallet = await this.walletRepo.findOne({ where: { userId: targetUserId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    return { data: wallet };
  }
}
