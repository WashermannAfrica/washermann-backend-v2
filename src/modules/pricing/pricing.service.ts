import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { Area } from '../../database/entities/area.entity';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { AreasService } from '../areas/areas.service';
import { PricingEngine } from './pricing.engine';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import { PricingConfig, PricingInputs, PricingResult } from './pricing.types';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(ConversionRate)
    private conversionRateRepository: Repository<ConversionRate>,

    private platformConfigService: PlatformConfigService,
    private areasService: AreasService,
  ) {}

  // ─── Public: authoritative calculation (called at order placement) ────────────

  async calculate(dto: CalculatePriceDto): Promise<PricingResult> {
    const config = await this.loadConfig(dto);
    const inputs: PricingInputs = {
      serviceType:  dto.serviceType,
      bagSize:      dto.bagSize,
      specialItems: dto.specialItems ?? [],
      ironingCount: dto.ironingCount ?? 0,
      areaId:       dto.areaId,
    };
    return PricingEngine.calculate(inputs, config);
  }

  // ─── Public: get full pricing model for client-side display ─────────────────

  /**
   * Returns the complete pricing model for the given area.
   *
   * Every base price is returned in two forms:
   *   - `rawWP`   — the platform base price before fees
   *   - `totalWP` — base + service charge + VAT (fees folded in; transport excluded)
   *
   * Transport is a flat per-order fee shown separately.
   * The effective fee multiplier is returned so the client can derive all-in prices
   * for items not explicitly listed.
   *
   * The client caches this response (~5 min TTL) and uses it for live cart previews.
   * The server always re-runs the canonical calculation at order placement.
   */
  async getClientConfig(areaId: string) {
    const [platformConfig, rate, area] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.getActiveConversionRate(),
      this.areasService.findOne(areaId),
    ]);

    const bagSizes     = ['small', 'medium', 'large', 'xl'] as const;
    const serviceTypes = ['wash_fold', 'wash_iron'] as const;

    // ── Load all raw prices in parallel ──────────────────────────────────────
    const bagPricePromises: Promise<void>[] = [];
    const rawBagPrices: Record<string, Record<string, number>> = {
      wash_fold: { small: 0, medium: 0, large: 0, xl: 0 },
      wash_iron: { small: 0, medium: 0, large: 0, xl: 0 },
    };

    for (const st of serviceTypes) {
      for (const bs of bagSizes) {
        bagPricePromises.push(
          this.platformConfigService.getActiveBagPrice(st, bs)
            .then(p => { rawBagPrices[st][bs] = p; })
            .catch(() => { /* stays 0 if not configured */ }),
        );
      }
    }

    const [, rawSpecialItemPrices] = await Promise.all([
      Promise.all(bagPricePromises),
      this.platformConfigService.getAllActiveSpecialItemPrices(),
    ]);

    let ironingUnitPriceWP = 0;
    try {
      ironingUnitPriceWP = await this.platformConfigService.getActiveIroningPrice();
    } catch { /* stays 0 */ }

    // ── Compute fee multiplier (service charge × VAT — excludes transport) ───
    // e.g. serviceCharge = 5%, vat = 7.5%  →  multiplier = 1.05 × 1.075 ≈ 1.12875
    const scMultiplier  = 1 + (platformConfig.serviceChargePercent / 100);
    const vatMultiplier = platformConfig.vatPercent > 0
      ? 1 + (platformConfig.vatPercent / 100)
      : 1;
    const feeMultiplier = scMultiplier * vatMultiplier;

    // Helper: apply fees and return rounded total
    const withFees = (rawWP: number) => Math.round(rawWP * feeMultiplier);

    // ── Build all-in bag prices ───────────────────────────────────────────────
    const allInBagPrices: Record<string, Record<string, { rawWP: number; totalWP: number }>> = {};
    for (const st of serviceTypes) {
      allInBagPrices[st] = {};
      for (const bs of bagSizes) {
        const raw = rawBagPrices[st][bs];
        allInBagPrices[st][bs] = { rawWP: raw, totalWP: withFees(raw) };
      }
    }

    // ── Build all-in special item prices ─────────────────────────────────────
    const allInSpecialItemPrices: Record<string, { rawWP: number; totalWP: number }> = {};
    for (const [itemType, rawWP] of Object.entries(rawSpecialItemPrices)) {
      allInSpecialItemPrices[itemType] = { rawWP, totalWP: withFees(rawWP) };
    }

    // ── Ironing all-in ────────────────────────────────────────────────────────
    const ironing = {
      rawWP:   ironingUnitPriceWP,
      totalWP: withFees(ironingUnitPriceWP),
    };

    // ── Naira conversion helpers ──────────────────────────────────────────────
    const nairaPerWP = rate.pointsPerUnit > 0
      ? Math.round((1 / rate.pointsPerUnit) * 10000) / 10000
      : 0;

    return {
      /**
       * Per-item prices with all percentage fees (service charge + VAT) folded in.
       * Transport is shown separately below — it is a flat per-order fee.
       * Use `totalWP` for all customer-facing display labels.
       */
      bagPrices:        allInBagPrices,
      specialItemPrices: allInSpecialItemPrices,
      ironing,

      /**
       * Per-order flat fees (not folded into per-item prices above).
       */
      transportFeeWP: area.transportFeeWP,

      /**
       * Fee breakdown — for transparency and client-side calculation of custom items.
       *  feeMultiplier  = multiply any base price by this to get the all-in display price.
       *  e.g. customRawPrice × feeMultiplier + transportFeeWP = what the customer pays.
       */
      fees: {
        serviceChargePercent: platformConfig.serviceChargePercent,
        vatPercent:           platformConfig.vatPercent,
        repSharePercent:      platformConfig.repSharePercent,   // informational (not charged to customer)
        feeMultiplier:        Math.round(feeMultiplier * 100000) / 100000,
        effectivePercentage:  Math.round((feeMultiplier - 1) * 10000) / 100,  // e.g. 12.88
      },

      /**
       * WashPoints ↔ Naira conversion snapshot.
       */
      conversion: {
        conversionRateId: rate.id,
        pointsPerUnit:    rate.pointsPerUnit,   // WP per ₦1
        nairaPerWP,                             // ₦ per 1 WP (display only)
      },

      cachedAt: new Date().toISOString(),
    };
  }

  // ─── Internal: used by OrdersService at order placement ──────────────────────

  async calculateForOrder(inputs: PricingInputs): Promise<PricingResult> {
    const config = await this.loadConfigFromInputs(inputs);
    return PricingEngine.calculate(inputs, config);
  }

  // ─── Config loader ────────────────────────────────────────────────────────────

  private async loadConfig(dto: CalculatePriceDto): Promise<PricingConfig> {
    const inputs: PricingInputs = {
      serviceType:  dto.serviceType,
      bagSize:      dto.bagSize,
      specialItems: dto.specialItems ?? [],
      ironingCount: dto.ironingCount ?? 0,
      areaId:       dto.areaId,
    };
    return this.loadConfigFromInputs(inputs);
  }

  async loadConfigFromInputs(inputs: PricingInputs): Promise<PricingConfig> {
    const [platformConfig, rate, area, bagPriceWP, ironingUnitPriceWP] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.getActiveConversionRate(),
      this.areasService.findOne(inputs.areaId),
      this.platformConfigService.getActiveBagPrice(inputs.serviceType, inputs.bagSize),
      inputs.serviceType === 'wash_iron' && inputs.ironingCount > 0
        ? this.platformConfigService.getActiveIroningPrice()
        : Promise.resolve(0),
    ]);

    // Load special item prices
    const specialItemPrices: Record<string, number> = {};
    for (const item of inputs.specialItems) {
      if (!(item.type in specialItemPrices)) {
        const price = await this.platformConfigService.getActiveSpecialItemPrice(item.type);
        specialItemPrices[item.type] = price ?? 0;
      }
    }

    return {
      bagPriceWP,
      specialItemPrices,
      ironingUnitPriceWP,
      serviceChargePercent: platformConfig.serviceChargePercent,
      vatPercent:           platformConfig.vatPercent,
      transportFeeWP:       area.transportFeeWP,
      conversionRateId:     rate.id,
      pointsPerUnit:        rate.pointsPerUnit,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  async getActiveConversionRate(): Promise<ConversionRate> {
    const rate = await this.conversionRateRepository
      .createQueryBuilder('r')
      .where('r.currency = :c', { c: 'NGN' })
      .andWhere('r.effectiveFrom <= NOW()')
      .orderBy('r.effectiveFrom', 'DESC')
      .getOne();

    if (!rate) {
      // Fallback: return a sensible default so the engine doesn't crash during bootstrapping
      return {
        id: '00000000-0000-0000-0000-000000000000',
        currency: 'NGN',
        pointsPerUnit: 1,
        effectiveFrom: new Date(),
        createdBy: null,
        notes: null,
        createdAt: new Date(),
      } as ConversionRate;
    }
    return rate;
  }
}
