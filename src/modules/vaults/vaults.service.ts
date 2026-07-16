import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import { Vault, VaultStatus } from '../../database/entities/vault.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { CreateVaultDto } from './dto/create-vault.dto';

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);

  constructor(
    @InjectRepository(Vault) private vaultRepo: Repository<Vault>,
    @InjectRepository(ConversionRate) private rateRepo: Repository<ConversionRate>,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createVault(dto: CreateVaultDto, adminUserId: string): Promise<{ data: Vault; message: string }> {
    // Determine conversion rate
    let rate: ConversionRate;
    if (dto.conversionRateId) {
      const found = await this.rateRepo.findOne({ where: { id: dto.conversionRateId } });
      if (!found) throw new BadRequestException('Conversion rate not found');
      rate = found;
    } else {
      const found = await this.rateRepo
        .createQueryBuilder('r')
        .where('r.effective_from <= NOW()')
        .orderBy('r.effective_from', 'DESC')
        .limit(1)
        .getOne();
      if (!found) throw new BadRequestException('No active conversion rate found. Create one first.');
      rate = found;
    }

    // Check whether this is the first vault ever
    const existingCount = await this.vaultRepo.count();
    const shouldBeDefault = dto.isDefault ?? existingCount === 0;

    // If setting as default, unset all other defaults
    if (shouldBeDefault) {
      await this.vaultRepo.update({ isDefault: true }, { isDefault: false });
    }

    const vault = this.vaultRepo.create({
      name: dto.name,
      purpose: dto.purpose,
      totalPoints: dto.totalPoints,
      usedPoints: 0,
      conversionRateId: rate.id,
      conversionRateSnapshot: rate.pointsPerUnit,
      status: VaultStatus.ACTIVE,
      isDefault: shouldBeDefault,
      sequenceOrder: dto.sequenceOrder ?? null,
      autoCreateOnThreshold: dto.autoCreateOnThreshold ?? false,
      autoCreateThreshold: dto.autoCreateThreshold ?? null,
      autoCreateUseSameRate: dto.autoCreateUseSameRate ?? true,
      nextVaultId: dto.nextVaultId ?? null,
      notes: dto.notes ?? null,
      createdBy: adminUserId,
    });

    await this.vaultRepo.save(vault);

    this.logger.log(`Vault created: ${vault.id} | "${vault.name}" | ${vault.totalPoints} WP | default=${vault.isDefault}`);

    return { data: vault, message: `Vault "${vault.name}" created successfully` };
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async listVaults(page: number, limit: number): Promise<{ data: Vault[]; meta: object }> {
    const [data, total] = await this.vaultRepo.findAndCount({
      order: { sequenceOrder: 'ASC', createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  async getVault(vaultId: string): Promise<{ data: Vault }> {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId } });
    if (!vault) throw new BadRequestException('Vault not found');
    return { data: vault };
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────────

  async deactivateVault(vaultId: string, adminUserId: string): Promise<{ data: Vault; message: string }> {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId } });
    if (!vault) throw new BadRequestException('Vault not found');

    if (vault.status === VaultStatus.DEACTIVATED) {
      throw new BadRequestException('Vault is already deactivated');
    }

    // Cannot deactivate the only remaining ACTIVE default vault
    if (vault.isDefault) {
      const activeCount = await this.vaultRepo.count({
        where: { status: VaultStatus.ACTIVE, id: Not(vaultId) },
      });
      if (activeCount === 0) {
        throw new BadRequestException('Cannot deactivate the only remaining active vault');
      }
    }

    vault.status = VaultStatus.DEACTIVATED;
    vault.deactivatedAt = new Date();
    vault.deactivatedBy = adminUserId;

    const wasDefault = vault.isDefault;
    vault.isDefault = false;

    await this.vaultRepo.save(vault);

    if (wasDefault) {
      this.activateNextInSequence(vault).catch((err) =>
        this.logger.error(`activateNextInSequence failed after deactivation: ${err.message}`),
      );
    }

    this.logger.log(`Vault deactivated: ${vault.id} by admin ${adminUserId}`);

    return { data: vault, message: `Vault "${vault.name}" deactivated` };
  }

  // ─── Set Default ──────────────────────────────────────────────────────────────

  async setDefault(vaultId: string): Promise<{ data: Vault; message: string }> {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId } });
    if (!vault) throw new BadRequestException('Vault not found');
    if (vault.status !== VaultStatus.ACTIVE) {
      throw new BadRequestException('Only an ACTIVE vault can be set as default');
    }

    await this.vaultRepo.update({ isDefault: true }, { isDefault: false });
    vault.isDefault = true;
    await this.vaultRepo.save(vault);

    this.logger.log(`Vault set as default: ${vault.id}`);

    return { data: vault, message: `Vault "${vault.name}" is now the default` };
  }

  // ─── Internal: get active default vault ──────────────────────────────────────

  async getActiveDefaultVault(): Promise<Vault> {
    // Try default first
    let vault = await this.vaultRepo.findOne({
      where: { isDefault: true, status: VaultStatus.ACTIVE },
    });

    if (!vault) {
      // Fall back to lowest sequence_order ACTIVE vault
      vault = await this.vaultRepo.findOne({
        where: { status: VaultStatus.ACTIVE },
        order: { sequenceOrder: 'ASC', createdAt: 'ASC' },
      });
    }

    if (!vault) {
      throw new ServiceUnavailableException('No active vault available for WashPoint operations');
    }

    return vault;
  }

  // ─── Internal: debit vault (atomic) ──────────────────────────────────────────

  async debitVault(vaultId: string, amount: number, manager?: EntityManager): Promise<void> {
    const exec = async (mgr: EntityManager) => {
      const vault = await mgr.findOne(Vault, {
        where: { id: vaultId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!vault) throw new BadRequestException(`Vault not found: ${vaultId}`);
      if (vault.status !== VaultStatus.ACTIVE) {
        throw new BadRequestException(`Vault ${vaultId} is not active (status=${vault.status})`);
      }

      const available = vault.totalPoints - vault.usedPoints;
      if (available < amount) {
        throw new BadRequestException(
          `Vault insufficient capacity. Available: ${available} WP, required: ${amount} WP`,
        );
      }

      vault.usedPoints += amount;

      if (vault.usedPoints >= vault.totalPoints) {
        vault.status = VaultStatus.EXHAUSTED;
      }

      await mgr.save(Vault, vault);

      // Fire-and-forget post-save side effects
      if (vault.status === VaultStatus.EXHAUSTED) {
        this.activateNextInSequence(vault).catch((err) =>
          this.logger.error(`activateNextInSequence failed: ${err.message}`),
        );
      } else if (
        vault.autoCreateOnThreshold &&
        vault.autoCreateThreshold !== null &&
        (vault.totalPoints - vault.usedPoints) <= vault.autoCreateThreshold
      ) {
        this.triggerAutoCreate(vault).catch((err) =>
          this.logger.error(`triggerAutoCreate failed: ${err.message}`),
        );
      }
    };

    if (manager) {
      await exec(manager);
    } else {
      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await exec(qr.manager);
        await qr.commitTransaction();
      } catch (err) {
        await qr.rollbackTransaction();
        throw err;
      } finally {
        await qr.release();
      }
    }
  }

  // ─── Internal: get available points ──────────────────────────────────────────

  async getAvailablePoints(vaultId: string): Promise<number> {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId } });
    if (!vault) throw new BadRequestException('Vault not found');
    return vault.totalPoints - vault.usedPoints;
  }

  // ─── Private: activate next vault in sequence ─────────────────────────────────

  private async activateNextInSequence(exhaustedVault: Vault): Promise<void> {
    let nextVault: Vault | null = null;

    if (exhaustedVault.nextVaultId) {
      nextVault = await this.vaultRepo.findOne({
        where: { id: exhaustedVault.nextVaultId, status: VaultStatus.ACTIVE },
      });
    }

    if (!nextVault) {
      // Find lowest sequence_order ACTIVE vault that isn't the exhausted one
      nextVault = await this.vaultRepo.findOne({
        where: { status: VaultStatus.ACTIVE, id: Not(exhaustedVault.id) },
        order: { sequenceOrder: 'ASC', createdAt: 'ASC' },
      });
    }

    if (!nextVault) {
      this.logger.warn(`No active vault to promote after ${exhaustedVault.id} exhausted/deactivated`);
      return;
    }

    // Set the next vault as default
    await this.vaultRepo.update({ isDefault: true }, { isDefault: false });
    nextVault.isDefault = true;
    await this.vaultRepo.save(nextVault);

    this.logger.log(`Vault ${nextVault.id} promoted to default after ${exhaustedVault.id} exhausted/deactivated`);
  }

  // ─── Private: trigger auto-create ────────────────────────────────────────────

  private async triggerAutoCreate(vault: Vault): Promise<void> {
    // Determine highest existing sequenceOrder
    const highestSeqVault = await this.vaultRepo.findOne({
      where: {},
      order: { sequenceOrder: 'DESC' },
    });
    const newSeqOrder = (highestSeqVault?.sequenceOrder ?? 0) + 1;

    let rateSnapshot: number;
    let rateId: string | null;

    if (vault.autoCreateUseSameRate) {
      rateSnapshot = vault.conversionRateSnapshot!;
      rateId = vault.conversionRateId;
    } else {
      const activeRate = await this.rateRepo
        .createQueryBuilder('r')
        .where('r.effective_from <= NOW()')
        .orderBy('r.effective_from', 'DESC')
        .limit(1)
        .getOne();
      rateSnapshot = activeRate?.pointsPerUnit ?? vault.conversionRateSnapshot!;
      rateId = activeRate?.id ?? vault.conversionRateId;
    }

    const newVault = this.vaultRepo.create({
      name: `${vault.name} (Auto)`,
      purpose: vault.purpose,
      totalPoints: vault.totalPoints,
      usedPoints: 0,
      conversionRateId: rateId,
      conversionRateSnapshot: rateSnapshot,
      status: VaultStatus.ACTIVE,
      isDefault: false, // admin must manually promote
      sequenceOrder: newSeqOrder,
      autoCreateOnThreshold: vault.autoCreateOnThreshold,
      autoCreateThreshold: vault.autoCreateThreshold,
      autoCreateUseSameRate: vault.autoCreateUseSameRate,
      nextVaultId: null,
      notes: `Auto-created when vault ${vault.id} reached threshold`,
      createdBy: null,
    });

    await this.vaultRepo.save(newVault);

    this.logger.log(`Auto-created vault ${newVault.id} triggered by vault ${vault.id} threshold`);
  }
}
