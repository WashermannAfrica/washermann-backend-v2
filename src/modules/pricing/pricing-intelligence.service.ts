import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorPricing, isPriceItemLive } from '../../database/entities/vendor-pricing.entity';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PricingService } from './pricing.service';
import { CreatePriceListEntryDto } from '../platform-config/dto/price-list.dto';

// ─── Output types ─────────────────────────────────────────────────────────────

export interface GarmentPriceStats {
  garmentType:  string;
  vendorCount:  number;       // how many active vendors price this garment
  minNaira:     number;
  maxNaira:     number;
  meanNaira:    number;
  p25Naira:     number;
  p50Naira:     number;       // median
  p70Naira:     number;
  p75Naira:     number;
  p90Naira:     number;
  /** Suggested platform price — at the configured percentile */
  suggestedNaira:  number;
  suggestedWP:     number;    // suggestedNaira × pointsPerUnit (rounded)
  /** Current platform price in WP (0 if not set) */
  currentPlatformWP: number;
  /** Difference between suggested and current (positive = raise, negative = lower) */
  diffWP: number;
}

export interface PriceIntelligenceReport {
  generatedAt:               string;
  conversionRateId:          string;
  pointsPerUnit:             number;
  priceSuggestionPercentile: number;
  garments:                  GarmentPriceStats[];
}

export interface ApplySuggestionsResult {
  applied:  string[];   // garmentTypes where a new entry was written
  skipped:  string[];   // garmentTypes where current price already matches (within tolerance)
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PricingIntelligenceService {
  constructor(
    @InjectRepository(VendorPricing)
    private vendorPricingRepository: Repository<VendorPricing>,

    private platformConfigService: PlatformConfigService,
    private pricingService: PricingService,
  ) {}

  // ─── Analysis ─────────────────────────────────────────────────────────────────

  /**
   * Aggregate all active vendor prices per garment type and return statistical
   * spread + a platform price suggestion at the configured percentile.
   *
   * "Active" = latest approved row per vendor (approvedAt IS NOT NULL,
   * effectiveFrom <= NOW()).
   */
  async analyze(): Promise<PriceIntelligenceReport> {
    const [platformConfig, rate] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
    ]);

    const percentile = platformConfig.priceSuggestionPercentile ?? 70;
    const pointsPerUnit = rate.pointsPerUnit;

    // ── Fetch latest active pricing per vendor ──────────────────────────────
    // We want the most recent approved row for each vendor.
    // Using a subquery to get max(effectiveFrom) per vendorId.
    const rows = await this.vendorPricingRepository
      .createQueryBuilder('vp')
      .where('vp.approvedAt IS NOT NULL')
      .andWhere('vp.effectiveFrom <= NOW()')
      .orderBy('vp.vendorId')
      .addOrderBy('vp.effectiveFrom', 'DESC')
      .getMany();

    // Deduplicate: keep only the most recent row per vendor
    const latestPerVendor = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      if (!latestPerVendor.has(row.vendorId)) {
        latestPerVendor.set(row.vendorId, row);
      }
    }

    // ── Aggregate prices by garmentType ───────────────────────────────────
    const pricesByType = new Map<string, number[]>();
    for (const vp of latestPerVendor.values()) {
      for (const item of vp.items) {
        if (!isPriceItemLive(item)) continue; // approved/legacy lines only
        if (!item.garmentType || item.priceNaira <= 0) continue;
        const key = item.garmentType.toLowerCase().trim();
        if (!pricesByType.has(key)) pricesByType.set(key, []);
        pricesByType.get(key)!.push(item.priceNaira);
      }
    }

    // ── Load current platform prices for comparison ────────────────────────
    const currentPlatformPrices = await this.platformConfigService.getAllActiveSpecialItemPrices();

    // ── Compute stats per garment type ────────────────────────────────────
    const garments: GarmentPriceStats[] = [];

    for (const [garmentType, prices] of pricesByType.entries()) {
      if (prices.length === 0) continue;

      const sorted = [...prices].sort((a, b) => a - b);

      const suggestedNaira = this.percentileValue(sorted, percentile);
      // Convert Naira to WP: WP = Naira × pointsPerUnit (pointsPerUnit = WP per ₦1)
      const suggestedWP    = Math.round(suggestedNaira * pointsPerUnit);
      const currentWP      = currentPlatformPrices[garmentType] ?? 0;

      garments.push({
        garmentType,
        vendorCount:   sorted.length,
        minNaira:      sorted[0],
        maxNaira:      sorted[sorted.length - 1],
        meanNaira:     Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length * 100) / 100,
        p25Naira:      this.percentileValue(sorted, 25),
        p50Naira:      this.percentileValue(sorted, 50),
        p70Naira:      this.percentileValue(sorted, 70),
        p75Naira:      this.percentileValue(sorted, 75),
        p90Naira:      this.percentileValue(sorted, 90),
        suggestedNaira,
        suggestedWP,
        currentPlatformWP: currentWP,
        diffWP:            suggestedWP - currentWP,
      });
    }

    // Sort by garment type name for a stable, readable response
    garments.sort((a, b) => a.garmentType.localeCompare(b.garmentType));

    return {
      generatedAt:               new Date().toISOString(),
      conversionRateId:          rate.id,
      pointsPerUnit,
      priceSuggestionPercentile: percentile,
      garments,
    };
  }

  // ─── Apply suggestions ────────────────────────────────────────────────────────

  /**
   * Applies the computed price suggestions to the platform price list.
   *
   * For each garment type with a non-zero `diffWP` (above the tolerance
   * threshold), a new `special_item` entry is written to `platform_price_list`.
   *
   * @param adminId        - UUID of the admin triggering the apply
   * @param garmentTypes   - Optional filter — if provided, only apply for these
   *                         garment types. Omit to apply all suggestions.
   * @param toleranceWP    - Skip if |diffWP| ≤ this value (avoids noise updates).
   *                         Defaults to 0 (apply all).
   */
  async applySuggestions(
    adminId: string,
    garmentTypes?: string[],
    toleranceWP = 0,
  ): Promise<ApplySuggestionsResult> {
    const report  = await this.analyze();
    const applied: string[] = [];
    const skipped: string[] = [];

    const targets = garmentTypes
      ? report.garments.filter(g => garmentTypes.includes(g.garmentType))
      : report.garments;

    for (const g of targets) {
      if (Math.abs(g.diffWP) <= toleranceWP) {
        skipped.push(g.garmentType);
        continue;
      }
      if (g.suggestedWP <= 0) {
        skipped.push(g.garmentType);
        continue;
      }

      const dto: CreatePriceListEntryDto = {
        priceType:     'special_item',
        itemType:      g.garmentType,
        priceWP:       g.suggestedWP,
        label:         `${g.garmentType} (auto-suggested P${report.priceSuggestionPercentile})`,
        effectiveFrom: new Date().toISOString(),
      };
      await this.platformConfigService.addPriceEntry(dto, adminId);
      applied.push(g.garmentType);
    }

    return { applied, skipped };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Returns the value at the given percentile from a *sorted* array.
   * Uses linear interpolation (same as numpy's default).
   */
  private percentileValue(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const frac  = index - lower;

    const value = sorted[lower] + frac * (sorted[upper] - sorted[lower]);
    return Math.round(value * 100) / 100;
  }
}
