import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { GiftCard, GiftCardCreatorType, GiftCardSourceType, GiftCardStatus } from '../../database/entities/gift-card.entity';
import { GiftCardRedemption } from '../../database/entities/gift-card-redemption.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { CompanyLedgerEntry, CompanyLedgerSource, CompanyLedgerType } from '../../database/entities/company-ledger-entry.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { VaultsService } from '../vaults/vaults.service';
import { WalletsService } from '../wallets/wallets.service';
import { CreateGiftCardDto } from './dto/create-gift-card.dto';
import { AssignmentStatus } from '../../common/enums/assignment-status.enum';

@Injectable()
export class GiftCardsService {
  private readonly logger = new Logger(GiftCardsService.name);

  constructor(
    @InjectRepository(GiftCard)
    private giftCardRepo: Repository<GiftCard>,
    @InjectRepository(GiftCardRedemption)
    private redemptionRepo: Repository<GiftCardRedemption>,
    @InjectRepository(CompanyWallet)
    private companyWalletRepo: Repository<CompanyWallet>,
    @InjectRepository(CompanyLedgerEntry)
    private companyLedgerRepo: Repository<CompanyLedgerEntry>,
    @InjectRepository(CompanyEmployee)
    private companyEmployeeRepo: Repository<CompanyEmployee>,
    @InjectDataSource()
    private dataSource: DataSource,
    @Inject(forwardRef(() => VaultsService))
    private vaultsService: VaultsService,
    @Inject(forwardRef(() => WalletsService))
    private walletsService: WalletsService,
  ) {}

  // ─── Admin: create gift card from vault ──────────────────────────────────────

  async createAdminGiftCard(dto: CreateGiftCardDto, adminUserId: string): Promise<{ data: GiftCard; message: string }> {
    const totalWpDebited = dto.wpValuePerUse * dto.maxUsages;

    // Determine vault
    let vaultId: string;
    if (dto.vaultId) {
      const { data: vault } = await this.vaultsService.getVault(dto.vaultId);
      const available = vault.totalPoints - vault.usedPoints;
      if (available < totalWpDebited) {
        throw new BadRequestException(
          `Vault insufficient capacity. Available: ${available} WP, required: ${totalWpDebited} WP`,
        );
      }
      vaultId = vault.id;
    } else {
      const vault = await this.vaultsService.getActiveDefaultVault();
      const available = vault.totalPoints - vault.usedPoints;
      if (available < totalWpDebited) {
        throw new BadRequestException(
          `Active vault insufficient capacity. Available: ${available} WP, required: ${totalWpDebited} WP`,
        );
      }
      vaultId = vault.id;
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Debit vault inside transaction
      await this.vaultsService.debitVault(vaultId, totalWpDebited, qr.manager);

      // Generate unique code
      const code = await this.generateUniqueCode();

      const giftCard = qr.manager.create(GiftCard, {
        code,
        creatorType: GiftCardCreatorType.ADMIN,
        creatorId: adminUserId,
        sourceType: GiftCardSourceType.VAULT,
        sourceId: vaultId,
        wpValuePerUse: dto.wpValuePerUse,
        maxUsages: dto.maxUsages,
        usedCount: 0,
        totalWpDebited,
        qualificationCriteria: dto.qualificationCriteria ?? null,
        isPublic: dto.isPublic ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: GiftCardStatus.ACTIVE,
        revokedAt: null,
        revokedBy: null,
        refundedWp: null,
      });

      await qr.manager.save(GiftCard, giftCard);
      await qr.commitTransaction();

      this.logger.log(`Admin gift card created: ${giftCard.id} | code=${code} | ${totalWpDebited} WP debited from vault ${vaultId}`);

      return { data: giftCard, message: `Gift card created: ${code}` };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Company: create gift card from company wallet ────────────────────────────

  async createCompanyGiftCard(
    companyId: string,
    dto: CreateGiftCardDto,
    companyAdminUserId: string,
  ): Promise<{ data: GiftCard; message: string }> {
    const totalWpDebited = dto.wpValuePerUse * dto.maxUsages;

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // Lock company wallet
      const wallet = await qr.manager.findOne(CompanyWallet, {
        where: { companyId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException(`Company wallet not found for company ${companyId}`);
      }

      if (wallet.wpBalance < totalWpDebited) {
        throw new BadRequestException(
          `Insufficient company wallet balance. Available: ${wallet.wpBalance} WP, required: ${totalWpDebited} WP`,
        );
      }

      // Debit company wallet
      const balanceBefore = wallet.wpBalance;
      const balanceAfter = balanceBefore - totalWpDebited;

      wallet.wpBalance = balanceAfter;
      await qr.manager.save(CompanyWallet, wallet);

      // Create company ledger entry
      const ledgerEntry = qr.manager.create(CompanyLedgerEntry, {
        companyWalletId: wallet.id,
        companyId,
        type: CompanyLedgerType.DEBIT,
        amount: totalWpDebited,
        balanceBefore,
        balanceAfter,
        source: CompanyLedgerSource.GIFT_CARD_CREATION,
        fiatAmountKobo: null,
        reference: `GC-${Date.now()}`,
        description: `Gift card creation: ${totalWpDebited} WP debited`,
        metadata: null,
      });
      await qr.manager.save(CompanyLedgerEntry, ledgerEntry);

      // Generate unique code
      const code = await this.generateUniqueCode();

      const giftCard = qr.manager.create(GiftCard, {
        code,
        creatorType: GiftCardCreatorType.COMPANY,
        creatorId: companyId,
        sourceType: GiftCardSourceType.COMPANY_WALLET,
        sourceId: wallet.id,
        wpValuePerUse: dto.wpValuePerUse,
        maxUsages: dto.maxUsages,
        usedCount: 0,
        totalWpDebited,
        qualificationCriteria: dto.qualificationCriteria ?? null,
        isPublic: dto.isPublic ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: GiftCardStatus.ACTIVE,
        revokedAt: null,
        revokedBy: null,
        refundedWp: null,
      });

      await qr.manager.save(GiftCard, giftCard);
      await qr.commitTransaction();

      this.logger.log(`Company gift card created: ${giftCard.id} | code=${code} | ${totalWpDebited} WP debited from company wallet ${wallet.id}`);

      return { data: giftCard, message: `Gift card created: ${code}` };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ─── Admin: list gift cards ───────────────────────────────────────────────────

  async listAdminGiftCards(page: number, limit: number, status?: GiftCardStatus) {
    const where: any = {};
    if (status) where.status = status;

    const [data, total] = await this.giftCardRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Company: list gift cards ─────────────────────────────────────────────────

  async listCompanyGiftCards(companyId: string, page: number, limit: number) {
    const [data, total] = await this.giftCardRepo.findAndCount({
      where: { creatorType: GiftCardCreatorType.COMPANY, creatorId: companyId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Revoke gift card ─────────────────────────────────────────────────────────

  async revokeGiftCard(
    giftCardId: string,
    revokerId: string,
    isAdmin: boolean,
    companyId?: string,
  ): Promise<{ data: GiftCard; message: string }> {
    const giftCard = await this.giftCardRepo.findOne({ where: { id: giftCardId } });
    if (!giftCard) throw new NotFoundException('Gift card not found');

    if (!isAdmin) {
      if (giftCard.creatorType !== GiftCardCreatorType.COMPANY || giftCard.creatorId !== companyId) {
        throw new BadRequestException('You do not have permission to revoke this gift card');
      }
    }

    if (giftCard.status !== GiftCardStatus.ACTIVE) {
      throw new BadRequestException(`Cannot revoke a gift card with status: ${giftCard.status}`);
    }

    const refund = (giftCard.maxUsages - giftCard.usedCount) * giftCard.wpValuePerUse;

    if (refund > 0) {
      if (giftCard.sourceType === GiftCardSourceType.VAULT) {
        // Refund WP back to vault by reducing usedPoints
        const qr = this.dataSource.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
          const { Vault } = await import('../../database/entities/vault.entity');
          const vault = await qr.manager.findOne(Vault, {
            where: { id: giftCard.sourceId },
            lock: { mode: 'pessimistic_write' },
          });
          if (vault) {
            vault.usedPoints = Math.max(0, vault.usedPoints - refund);
            // If vault was exhausted and now has capacity, reactivate
            const { VaultStatus } = await import('../../database/entities/vault.entity');
            if (vault.status === VaultStatus.EXHAUSTED && vault.usedPoints < vault.totalPoints) {
              vault.status = VaultStatus.ACTIVE;
            }
            await qr.manager.save(Vault, vault);
          }
          await qr.commitTransaction();
        } catch (err) {
          await qr.rollbackTransaction();
          throw err;
        } finally {
          await qr.release();
        }
      } else if (giftCard.sourceType === GiftCardSourceType.COMPANY_WALLET) {
        // Credit back to company wallet
        const wallet = await this.companyWalletRepo.findOne({ where: { id: giftCard.sourceId } });
        if (wallet) {
          const qr = this.dataSource.createQueryRunner();
          await qr.connect();
          await qr.startTransaction();
          try {
            const lockedWallet = await qr.manager.findOne(CompanyWallet, {
              where: { id: giftCard.sourceId },
              lock: { mode: 'pessimistic_write' },
            });
            if (lockedWallet) {
              const balanceBefore = lockedWallet.wpBalance;
              lockedWallet.wpBalance += refund;

              const ledgerEntry = qr.manager.create(CompanyLedgerEntry, {
                companyWalletId: lockedWallet.id,
                companyId: lockedWallet.companyId,
                type: CompanyLedgerType.CREDIT,
                amount: refund,
                balanceBefore,
                balanceAfter: lockedWallet.wpBalance,
                source: CompanyLedgerSource.GIFT_CARD_REVOCATION,
                fiatAmountKobo: null,
                reference: `GCR-${Date.now()}`,
                description: `Gift card revocation refund: ${refund} WP returned`,
                metadata: { giftCardId },
              });

              await qr.manager.save(CompanyLedgerEntry, ledgerEntry);
              await qr.manager.save(CompanyWallet, lockedWallet);
            }
            await qr.commitTransaction();
          } catch (err) {
            await qr.rollbackTransaction();
            throw err;
          } finally {
            await qr.release();
          }
        }
      }
    }

    giftCard.status = GiftCardStatus.REVOKED;
    giftCard.revokedAt = new Date();
    giftCard.revokedBy = revokerId;
    giftCard.refundedWp = refund;

    await this.giftCardRepo.save(giftCard);

    this.logger.log(`Gift card revoked: ${giftCard.id} | ${refund} WP refunded`);

    return { data: giftCard, message: `Gift card ${giftCard.code} revoked. ${refund} WP refunded.` };
  }

  // ─── Redeem gift card ─────────────────────────────────────────────────────────

  async redeemGiftCard(
    code: string,
    userId: string,
  ): Promise<{ data: { wpCredited: number; message: string } }> {
    const giftCard = await this.giftCardRepo.findOne({ where: { code } });

    if (!giftCard) throw new NotFoundException('Gift card not found');
    if (giftCard.status !== GiftCardStatus.ACTIVE) {
      throw new BadRequestException(`Gift card is ${giftCard.status}`);
    }

    if (giftCard.expiresAt && giftCard.expiresAt < new Date()) {
      throw new BadRequestException('Gift card has expired');
    }

    if (giftCard.usedCount >= giftCard.maxUsages) {
      throw new BadRequestException('Gift card has reached its maximum usage limit');
    }

    // Check if user already redeemed this card
    const alreadyRedeemed = await this.redemptionRepo.findOne({
      where: { giftCardId: giftCard.id, redeemedBy: userId },
    });
    if (alreadyRedeemed) {
      throw new ConflictException('You have already redeemed this gift card');
    }

    // Qualification criteria check
    if (giftCard.qualificationCriteria?.employeeOnly) {
      const companyId = giftCard.qualificationCriteria.companyId as string | undefined;
      if (companyId) {
        const isEmployee = await this.companyEmployeeRepo.findOne({
          where: { userId, companyId, assignmentStatus: AssignmentStatus.ACTIVE },
        });
        if (!isEmployee) {
          throw new BadRequestException('This gift card is restricted to employees of the issuing company');
        }
      }
    }

    // Atomically increment usage and create redemption record
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const locked = await qr.manager.findOne(GiftCard, {
        where: { id: giftCard.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!locked) throw new NotFoundException('Gift card not found');

      // Re-check inside lock
      if (locked.status !== GiftCardStatus.ACTIVE) {
        throw new BadRequestException(`Gift card is ${locked.status}`);
      }
      if (locked.usedCount >= locked.maxUsages) {
        throw new BadRequestException('Gift card has reached its maximum usage limit');
      }

      locked.usedCount += 1;
      if (locked.usedCount >= locked.maxUsages) {
        locked.status = GiftCardStatus.EXHAUSTED;
      }

      await qr.manager.save(GiftCard, locked);

      const redemption = qr.manager.create(GiftCardRedemption, {
        giftCardId: locked.id,
        redeemedBy: userId,
        wpCredited: locked.wpValuePerUse,
      });
      await qr.manager.save(GiftCardRedemption, redemption);

      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    // Credit user wallet outside the gift card lock
    await this.walletsService.credit({
      userId,
      amount: giftCard.wpValuePerUse,
      source: LedgerSource.GIFT_CARD,
      description: `Gift card ${code} redeemed`,
      reference: code,
    });

    this.logger.log(`Gift card redeemed: code=${code} | user=${userId} | ${giftCard.wpValuePerUse} WP credited`);

    return {
      data: {
        wpCredited: giftCard.wpValuePerUse,
        message: `${giftCard.wpValuePerUse} WP added to your wallet`,
      },
    };
  }

  // ─── Private: code generation ─────────────────────────────────────────────────

  private generateGiftCardCode(): string {
    const bytes = randomBytes(8);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusables
    let code = 'WM-';
    for (let i = 0; i < bytes.length; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code; // e.g. WM-ABC12XY34
  }

  private async generateUniqueCode(): Promise<string> {
    let attempts = 0;
    while (attempts < 5) {
      const code = this.generateGiftCardCode();
      const existing = await this.giftCardRepo.findOne({ where: { code } });
      if (!existing) return code;
      attempts++;
    }
    throw new Error('Failed to generate unique gift card code after 5 attempts');
  }
}
