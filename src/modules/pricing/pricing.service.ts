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

  // ─── Public: get config for client-side real-time preview ────────────────────

  /**
   * Returns the full price config so the mobile/web client can run local calculations
   * without an API call on every cart change.
   *
   * The client fetches this once and caches it until a TTL (e.g. 5 min) expires.
   * The server always runs the canonical calculation at order placement regardless.
   */
  async getClientConfig(areaId: string) {
    const config = await this.platformConfigService.getConfig();
    const rate   = await this.getActiveConversionRate();
    const area   = await this.areasService.findOne(areaId);

    // Load bag prices for all combinations
    const bagSizes     = ['small', 'medium', 'large', 'xl'] as const;
    const serviceTypes = ['wash_fold', 'wash_iron'] as const;
    const bagPrices: Record<string, Record<string, number>> = {};

    for (const st of serviceTypes) {
      bagPrices[st] = {};
      for (const bs of bagSizes) {
        try {
          bagPrices[st][bs] = await this.platformConfigService.getActiveBagPrice(st, bs);
        } catch {
          bagPrices[st][bs] = 0;
        }
      }
    }

    // Load ironing unit price
    let ironingUnitPriceWP = 0;
    try {
      ironingUnitPriceWP = await this.platformConfigService.getActiveIroningPrice();
    } catch {
      ironingUnitPriceWP = 0;
    }

    return {
      bagPrices,
      ironingUnitPriceWP,
      serviceChargePercent: config.serviceChargePercent,
      transportFeeWP: area.transportFeeWP,
      conversionRateId: rate.id,
      pointsPerUnit: rate.pointsPerUnit,
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
      transportFeeWP: area.transportFeeWP,
      conversionRateId: rate.id,
      pointsPerUnit: rate.pointsPerUnit,
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
