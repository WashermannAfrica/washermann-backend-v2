import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { PlatformPriceList } from '../../database/entities/platform-price-list.entity';
import { RepBonusTier } from '../../database/entities/rep-bonus-tier.entity';
import { UpdatePlatformConfigDto } from './dto/update-config.dto';
import { CreatePriceListEntryDto, UpdateBonusTierDto } from './dto/price-list.dto';

@Injectable()
export class PlatformConfigService {
  constructor(
    @InjectRepository(PlatformConfig)
    private configRepository: Repository<PlatformConfig>,

    @InjectRepository(PlatformPriceList)
    private priceListRepository: Repository<PlatformPriceList>,

    @InjectRepository(RepBonusTier)
    private bonusTierRepository: Repository<RepBonusTier>,
  ) {}

  // ─── Platform Config ──────────────────────────────────────────────────────────

  async getConfig(): Promise<PlatformConfig> {
    const config = await this.configRepository.findOne({ where: {} });
    if (config) return config;

    // Bootstrap default row
    const defaults = this.configRepository.create({
      platformPriceOffsetPercent: 25,
      repSharePercent: 15,
      serviceChargePercent: 5,
      payoutRateNairaPerWP: 9,
      lowRatingThreshold: 3.5,
      bonusCyclePeriod: 'monthly',
      orderAutoCompleteHours: 24,
      updatedBy: null,
    });
    return this.configRepository.save(defaults);
  }

  async updateConfig(dto: UpdatePlatformConfigDto, adminId: string): Promise<PlatformConfig> {
    const config = await this.getConfig();

    if (dto.platformPriceOffsetPercent != null) config.platformPriceOffsetPercent = dto.platformPriceOffsetPercent;
    if (dto.repSharePercent            != null) config.repSharePercent            = dto.repSharePercent;
    if (dto.serviceChargePercent       != null) config.serviceChargePercent       = dto.serviceChargePercent;
    if (dto.payoutRateNairaPerWP       != null) config.payoutRateNairaPerWP       = dto.payoutRateNairaPerWP;
    if (dto.lowRatingThreshold         != null) config.lowRatingThreshold         = dto.lowRatingThreshold;
    if (dto.bonusCyclePeriod           != null) config.bonusCyclePeriod           = dto.bonusCyclePeriod;
    if (dto.orderAutoCompleteHours     != null) config.orderAutoCompleteHours     = dto.orderAutoCompleteHours;
    config.updatedBy = adminId;

    return this.configRepository.save(config);
  }

  // ─── Platform Price List ──────────────────────────────────────────────────────

  /**
   * Append a new price entry (immutable — previous entries remain).
   */
  async addPriceEntry(dto: CreatePriceListEntryDto, adminId: string) {
    const entry = this.priceListRepository.create({
      priceType:   dto.priceType,
      serviceType: dto.serviceType ?? null,
      bagSize:     dto.bagSize     ?? null,
      itemType:    dto.itemType    ?? null,
      priceWP:     dto.priceWP,
      label:       dto.label       ?? null,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
      createdBy:   adminId,
      approvedAt:  new Date(),
      approvedBy:  adminId,
    });
    return this.priceListRepository.save(entry);
  }

  /**
   * Get the full price list (all entries, newest first).
   */
  async getPriceList() {
    return this.priceListRepository.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Get the currently active price for a bag + service type combination.
   */
  async getActiveBagPrice(serviceType: 'wash_fold' | 'wash_iron', bagSize: string): Promise<number> {
    const entry = await this.priceListRepository
      .createQueryBuilder('p')
      .where('p.priceType = :t', { t: 'bag' })
      .andWhere('p.serviceType = :s', { s: serviceType })
      .andWhere('p.bagSize = :b', { b: bagSize })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getOne();
    if (!entry) throw new NotFoundException(`No active price found for ${serviceType} ${bagSize} bag`);
    return entry.priceWP;
  }

  /**
   * Get the currently active price for a special item type.
   */
  async getActiveSpecialItemPrice(itemType: string): Promise<number | null> {
    const entry = await this.priceListRepository
      .createQueryBuilder('p')
      .where('p.priceType = :t', { t: 'special_item' })
      .andWhere('p.itemType = :i', { i: itemType })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getOne();
    return entry?.priceWP ?? null;
  }

  /**
   * Get the currently active ironing unit price (per garment).
   */
  async getActiveIroningPrice(): Promise<number> {
    const entry = await this.priceListRepository
      .createQueryBuilder('p')
      .where('p.priceType = :t', { t: 'ironing' })
      .andWhere('p.approvedAt IS NOT NULL')
      .andWhere('p.effectiveFrom <= NOW()')
      .orderBy('p.effectiveFrom', 'DESC')
      .getOne();
    if (!entry) throw new NotFoundException('No active ironing price found');
    return entry.priceWP;
  }

  // ─── Rep Bonus Tiers ──────────────────────────────────────────────────────────

  async getBonusTiers() {
    return this.bonusTierRepository.find({
      where: { isActive: true },
      order: { minRating: 'DESC' },
    });
  }

  async getAllBonusTiers() {
    return this.bonusTierRepository.find({ order: { minRating: 'DESC' } });
  }

  async upsertBonusTier(dto: UpdateBonusTierDto, adminId: string) {
    const tier = this.bonusTierRepository.create({
      label:       dto.label,
      minRating:   dto.minRating,
      maxRating:   dto.maxRating,
      bonusPercent: dto.bonusPercent,
      flagReview:  dto.flagReview ?? false,
      isActive:    true,
      updatedBy:   adminId,
    });
    return this.bonusTierRepository.save(tier);
  }

  async deactivateBonusTier(tierId: string) {
    const tier = await this.bonusTierRepository.findOne({ where: { id: tierId } });
    if (!tier) throw new NotFoundException('Bonus tier not found');
    tier.isActive = false;
    return this.bonusTierRepository.save(tier);
  }

  /**
   * Seed the default bonus tier table (run once at bootstrap if empty).
   */
  async seedDefaultBonusTiers() {
    const count = await this.bonusTierRepository.count();
    if (count > 0) return;

    const defaults = [
      { label: 'Elite',   minRating: 4.8, maxRating: 5.0, bonusPercent: 15, flagReview: false },
      { label: 'Gold',    minRating: 4.5, maxRating: 4.7, bonusPercent: 10, flagReview: false },
      { label: 'Silver',  minRating: 4.0, maxRating: 4.4, bonusPercent: 5,  flagReview: false },
      { label: 'Bronze',  minRating: 3.5, maxRating: 3.9, bonusPercent: 0,  flagReview: false },
      { label: 'Review',  minRating: 0.0, maxRating: 3.4, bonusPercent: 0,  flagReview: true  },
    ];

    for (const d of defaults) {
      const tier = this.bonusTierRepository.create({ ...d, isActive: true, updatedBy: null });
      await this.bonusTierRepository.save(tier);
    }
  }
}
