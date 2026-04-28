import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, MoreThanOrEqual, Repository } from 'typeorm';
import { CompanyWallet, CompanyWalletStatus } from '../../database/entities/company-wallet.entity';
import {
  CompanyLedgerEntry,
  CompanyLedgerSource,
  CompanyLedgerType,
} from '../../database/entities/company-ledger-entry.entity';
import { AdminCompanyWalletCreditDto, AdminCompanyWalletDebitDto } from './dto/admin-company-wallet.dto';

export interface CompanyCreditOptions {
  companyId: string;
  amount: number;
  source: CompanyLedgerSource;
  fiatAmountKobo?: number;
  description: string;
  metadata?: Record<string, any>;
}

export interface CompanyDebitOptions {
  companyId: string;
  amount: number;
  source: CompanyLedgerSource;
  description: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class CompanyWalletService {
  private readonly logger = new Logger(CompanyWalletService.name);

  constructor(
    @InjectRepository(CompanyWallet)
    private walletRepo: Repository<CompanyWallet>,
    @InjectRepository(CompanyLedgerEntry)
    private ledgerRepo: Repository<CompanyLedgerEntry>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  // ─── Get or Create ────────────────────────────────────────────────────────────

  async getOrCreateWallet(companyId: string): Promise<CompanyWallet> {
    let wallet = await this.walletRepo.findOne({ where: { companyId } });
    if (!wallet) {
      wallet = this.walletRepo.create({
        companyId,
        wpBalance: 0,
        status: CompanyWalletStatus.ACTIVE,
      });
      await this.walletRepo.save(wallet);
      this.logger.log(`Company wallet created for company ${companyId}`);
    }
    return wallet;
  }

  // ─── Get wallet ───────────────────────────────────────────────────────────────

  async getWallet(companyId: string) {
    const wallet = await this.getOrCreateWallet(companyId);
    return {
      data: {
        id: wallet.id,
        companyId: wallet.companyId,
        wpBalance: wallet.wpBalance,
        status: wallet.status,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
    };
  }

  // ─── Get ledger ───────────────────────────────────────────────────────────────

  async getLedger(companyId: string, page = 1, limit = 20) {
    const wallet = await this.getOrCreateWallet(companyId);

    const [entries, total] = await this.ledgerRepo.findAndCount({
      where: { companyWalletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: entries,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Atomic Credit ────────────────────────────────────────────────────────────

  async credit(opts: CompanyCreditOptions): Promise<CompanyLedgerEntry> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const wallet = await qr.manager.findOne(CompanyWallet, {
        where: { companyId: opts.companyId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Company wallet not found for company ${opts.companyId}`);
      }
      if (wallet.status === CompanyWalletStatus.FROZEN) {
        throw new BadRequestException('Company wallet is frozen');
      }
      if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
        throw new BadRequestException('Credit amount must be a positive integer');
      }

      const balanceBefore = wallet.wpBalance;
      const balanceAfter = balanceBefore + opts.amount;

      const reference = await this.generateReference(qr.manager);

      const entry = qr.manager.create(CompanyLedgerEntry, {
        companyWalletId: wallet.id,
        companyId: opts.companyId,
        type: CompanyLedgerType.CREDIT,
        amount: opts.amount,
        balanceBefore,
        balanceAfter,
        source: opts.source,
        fiatAmountKobo: opts.fiatAmountKobo ?? null,
        reference,
        description: opts.description,
        metadata: opts.metadata ?? null,
      });
      await qr.manager.save(CompanyLedgerEntry, entry);

      wallet.wpBalance = balanceAfter;
      await qr.manager.save(CompanyWallet, wallet);

      await qr.commitTransaction();
      this.logger.log(
        `CREDIT ${opts.amount} WP → company ${opts.companyId} | src=${opts.source} | ref=${reference}`,
      );
      return entry;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Atomic Debit ─────────────────────────────────────────────────────────────

  async debit(opts: CompanyDebitOptions): Promise<CompanyLedgerEntry> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const wallet = await qr.manager.findOne(CompanyWallet, {
        where: { companyId: opts.companyId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Company wallet not found for company ${opts.companyId}`);
      }
      if (wallet.status === CompanyWalletStatus.FROZEN) {
        throw new BadRequestException('Company wallet is frozen');
      }
      if (!Number.isInteger(opts.amount) || opts.amount <= 0) {
        throw new BadRequestException('Debit amount must be a positive integer');
      }
      if (wallet.wpBalance < opts.amount) {
        throw new BadRequestException(
          `Insufficient balance. Available: ${wallet.wpBalance} WP, required: ${opts.amount} WP`,
        );
      }

      const balanceBefore = wallet.wpBalance;
      const balanceAfter = balanceBefore - opts.amount;

      const reference = await this.generateReference(qr.manager);

      const entry = qr.manager.create(CompanyLedgerEntry, {
        companyWalletId: wallet.id,
        companyId: opts.companyId,
        type: CompanyLedgerType.DEBIT,
        amount: opts.amount,
        balanceBefore,
        balanceAfter,
        source: opts.source,
        fiatAmountKobo: null,
        reference,
        description: opts.description,
        metadata: opts.metadata ?? null,
      });
      await qr.manager.save(CompanyLedgerEntry, entry);

      wallet.wpBalance = balanceAfter;
      await qr.manager.save(CompanyWallet, wallet);

      await qr.commitTransaction();
      this.logger.log(
        `DEBIT ${opts.amount} WP ← company ${opts.companyId} | src=${opts.source} | ref=${reference}`,
      );
      return entry;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Admin Credit / Debit ─────────────────────────────────────────────────────

  async adminCredit(companyId: string, dto: AdminCompanyWalletCreditDto) {
    await this.getOrCreateWallet(companyId);

    const entry = await this.credit({
      companyId,
      amount: dto.amount,
      source: CompanyLedgerSource.ADMIN_CREDIT,
      description: dto.description ?? `Admin credit of ${dto.amount} WP`,
    });

    return {
      data: entry,
      message: `${dto.amount} WP credited to company ${companyId}`,
    };
  }

  async adminDebit(companyId: string, dto: AdminCompanyWalletDebitDto) {
    const entry = await this.debit({
      companyId,
      amount: dto.amount,
      source: CompanyLedgerSource.ADMIN_DEBIT,
      description: dto.description ?? `Admin debit of ${dto.amount} WP`,
    });

    return {
      data: entry,
      message: `${dto.amount} WP debited from company ${companyId}`,
    };
  }

  // ─── Freeze / Unfreeze ────────────────────────────────────────────────────────

  async freezeWallet(companyId: string): Promise<void> {
    const wallet = await this.walletRepo.findOne({ where: { companyId } });
    if (wallet && wallet.status !== CompanyWalletStatus.FROZEN) {
      wallet.status = CompanyWalletStatus.FROZEN;
      await this.walletRepo.save(wallet);
      this.logger.log(`Company wallet frozen for company ${companyId}`);
    }
  }

  async unfreezeWallet(companyId: string): Promise<void> {
    const wallet = await this.walletRepo.findOne({ where: { companyId } });
    if (wallet && wallet.status === CompanyWalletStatus.FROZEN) {
      wallet.status = CompanyWalletStatus.ACTIVE;
      await this.walletRepo.save(wallet);
      this.logger.log(`Company wallet unfrozen for company ${companyId}`);
    }
  }

  // ─── Reference generation ─────────────────────────────────────────────────────

  private async generateReference(manager: EntityManager): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await manager.count(CompanyLedgerEntry, {
      where: { createdAt: MoreThanOrEqual(new Date(new Date().setHours(0, 0, 0, 0))) },
    });
    const seq = String(count + 1).padStart(6, '0');
    return `TXN-${today}-${seq}`;
  }
}
