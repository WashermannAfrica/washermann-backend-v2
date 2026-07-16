import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { VendorPricing, isPriceItemLive } from '../../database/entities/vendor-pricing.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { PlatformPriceList } from '../../database/entities/platform-price-list.entity';
import { Bag } from '../../database/entities/bag.entity';
import { Bundle } from '../../database/entities/bundle.entity';
import { BundleLine } from '../../database/entities/bundle-line.entity';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PricingService } from './pricing.service';
import { ChargeStackItem } from '../../database/entities/platform-config.entity';

export interface ItemPriceBreakdown {
  itemId:      string;
  name:        string;
  vendorCount: number;
  baseNgn:     number;        // P70 of vendor prices
  charges:     { key: string; label: string; amountNgn: number }[];
  priceNgn:    number | null; // base + charges (null if no vendors)
  priceWp:     number | null;
}

export interface EpochSummary {
  total:    number;
  priced:   number;
  hidden:   number;
  audited:  number;
  bags:     number;
  bagsPriced: number;
}

/**
 * The authoritative item-price engine.
 *
 * platformPrice(item) = P70(active vendors' approved prices for the item) + charge stack.
 * Cached on the item (₦ + WP), recomputed on a daily epoch (and on demand by an
 * admin), with each price change appended to platform_price_list as an audit row.
 * Items with no active vendor prices are hidden (isAvailable = false).
 */
@Injectable()
export class ItemPricingService {
  private readonly logger = new Logger(ItemPricingService.name);

  constructor(
    @InjectRepository(CatalogueItem) private items: Repository<CatalogueItem>,
    @InjectRepository(VendorPricing) private vendorPricing: Repository<VendorPricing>,
    @InjectRepository(Vendor) private vendors: Repository<Vendor>,
    @InjectRepository(PlatformPriceList) private priceList: Repository<PlatformPriceList>,
    @InjectRepository(Bag) private bags: Repository<Bag>,
    @InjectRepository(Bundle) private bundles: Repository<Bundle>,
    @InjectRepository(BundleLine) private bundleLines: Repository<BundleLine>,
    private platformConfigService: PlatformConfigService,
    private pricingService: PricingService,
  ) {}

  // ─── Daily price epoch ──────────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailyEpoch(): Promise<void> {
    try {
      const summary = await this.recomputeAll(null);
      this.logger.log(
        `Price epoch: ${summary.priced} priced, ${summary.hidden} hidden, ${summary.audited} audit rows`,
      );
    } catch (err) {
      this.logger.error(`Price epoch failed: ${(err as Error).message}`);
    }
  }

  // ─── Recompute every item ───────────────────────────────────────────────────
  async recomputeAll(adminId: string | null): Promise<EpochSummary> {
    const [config, rate, priceMap] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
      this.gatherVendorPricesByItem(),
    ]);
    const percentile = config.priceSuggestionPercentile ?? 70;

    const items = await this.items.find();
    let priced = 0, hidden = 0, audited = 0;

    for (const item of items) {
      const prices = priceMap.get(item.id) ?? [];
      let newNgn: number | null = null;
      let newWp: number | null = null;

      if (prices.length > 0) {
        const base = this.percentileValue([...prices].sort((a, b) => a - b), percentile);
        const charged = this.applyCharges(base, config.chargeStack);
        newNgn = Math.round(charged * 100) / 100;
        newWp = Math.round(charged * rate.pointsPerUnit);
        priced++;
      } else {
        hidden++;
      }

      const changed = (item.priceNgn ?? null) !== newNgn;
      item.priceNgn = newNgn;
      item.priceWp = newWp;
      item.isAvailable = item.isActive && newNgn != null;
      item.priceComputedAt = new Date();
      await this.items.save(item);

      // Append an immutable audit row only when the price actually changes.
      if (changed && newWp != null) {
        await this.priceList.save(this.priceList.create({
          priceType: 'special_item',
          itemType: item.slug,
          priceWP: newWp,
          label: `P70 epoch — ${item.name}`,
          effectiveFrom: new Date(),
          approvedAt: new Date(),
          createdBy: adminId,
          approvedBy: adminId,
        }));
        audited++;
      }
    }

    const bagResult = await this.recomputeBags();
    await this.recomputeBundles();
    return { total: items.length, priced, hidden, audited, bags: bagResult.bags, bagsPriced: bagResult.priced };
  }

  // ─── Bundle prices: P70(selectable item-type prices) × median(line qty) ──────
  async recomputeBundles(): Promise<{ bundles: number; priced: number }> {
    const [config, rate] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
    ]);
    const percentile = config.priceSuggestionPercentile ?? 70;

    const bundles = await this.bundles.find();
    let priced = 0;
    for (const bundle of bundles) {
      const lines = await this.bundleLines.find({ where: { bundleId: bundle.id } });
      const priceSet: number[] = [];
      const qtys: number[] = [];
      for (const line of lines) {
        qtys.push(line.quantity);
        if (line.lineType === 'item' && line.itemId) {
          const it = await this.items.findOne({ where: { id: line.itemId } });
          if (it && it.isActive && it.priceNgn != null) priceSet.push(it.priceNgn);
        } else if (line.lineType === 'category' && line.categoryId) {
          const its = await this.items.find({ where: { categoryId: line.categoryId, isActive: true } });
          for (const it of its) if (it.priceNgn != null) priceSet.push(it.priceNgn);
        }
      }

      let baseNgn: number | null = null, baseWp: number | null = null;
      let effNgn: number | null = null, effWp: number | null = null;
      if (priceSet.length && qtys.length) {
        const base = this.percentileValue([...priceSet].sort((a, b) => a - b), percentile);
        baseNgn = Math.round(base * this.median(qtys) * 100) / 100;
        baseWp = Math.round(baseNgn * rate.pointsPerUnit);
        effNgn = baseNgn;
        if (bundle.isPromo && bundle.promoType && bundle.promoValue != null) {
          effNgn = bundle.promoType === 'fixed'
            ? bundle.promoValue
            : Math.round(baseNgn * (1 - bundle.promoValue / 100) * 100) / 100;
        }
        effNgn = Math.max(0, Math.round(effNgn * 100) / 100);
        effWp = Math.round(effNgn * rate.pointsPerUnit);
        priced++;
      }
      bundle.priceNgn = baseNgn;
      bundle.priceWp = baseWp;
      bundle.effectivePriceNgn = effNgn;
      bundle.effectivePriceWp = effWp;
      bundle.priceComputedAt = new Date();
      await this.bundles.save(bundle);
    }
    return { bundles: bundles.length, priced };
  }

  private median(nums: number[]): number {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  // ─── Bag prices: P70(everyday item prices) × capacity ───────────────────────
  async recomputeBags(): Promise<{ bags: number; priced: number }> {
    const [config, rate] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
    ]);
    const everyday = await this.items.find({ where: { isEveryday: true, isActive: true } });
    const prices = everyday
      .map((i) => i.priceNgn)
      .filter((p): p is number => p != null && p > 0)
      .sort((a, b) => a - b);
    const basis = prices.length ? this.percentileValue(prices, config.priceSuggestionPercentile ?? 70) : null;

    const bags = await this.bags.find();
    let priced = 0;
    for (const bag of bags) {
      let ngn: number | null = null;
      let wp: number | null = null;
      if (basis != null) {
        ngn = Math.round(basis * bag.allowedItemCount * 100) / 100;
        wp = Math.round(ngn * rate.pointsPerUnit);
        priced++;
      }
      bag.priceNgn = ngn;
      bag.priceWp = wp;
      bag.priceComputedAt = new Date();
      await this.bags.save(bag);
    }
    return { bags: bags.length, priced };
  }

  // ─── Single-item breakdown (admin preview, no save) ─────────────────────────
  async breakdown(itemId: string): Promise<ItemPriceBreakdown> {
    const [item, config, rate, priceMap] = await Promise.all([
      this.items.findOne({ where: { id: itemId } }),
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
      this.gatherVendorPricesByItem(),
    ]);
    if (!item) {
      return { itemId, name: '(not found)', vendorCount: 0, baseNgn: 0, charges: [], priceNgn: null, priceWp: null };
    }
    const prices = priceMap.get(item.id) ?? [];
    if (prices.length === 0) {
      return { itemId, name: item.name, vendorCount: 0, baseNgn: 0, charges: [], priceNgn: null, priceWp: null };
    }
    const base = this.percentileValue([...prices].sort((a, b) => a - b), config.priceSuggestionPercentile ?? 70);
    const charges = (config.chargeStack ?? []).map((c) => ({
      key: c.key,
      label: c.label,
      amountNgn: c.kind === 'percent' ? Math.round(base * (c.value / 100) * 100) / 100 : c.value,
    }));
    const priceNgn = Math.round((base + charges.reduce((s, c) => s + c.amountNgn, 0)) * 100) / 100;
    return {
      itemId, name: item.name, vendorCount: prices.length,
      baseNgn: base, charges, priceNgn, priceWp: Math.round(priceNgn * rate.pointsPerUnit),
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  private applyCharges(base: number, stack: ChargeStackItem[] | null): number {
    let total = base;
    for (const c of stack ?? []) {
      total += c.kind === 'percent' ? base * (c.value / 100) : c.value;
    }
    return total;
  }

  /** Map of catalogue itemId → active verified vendors' prices (₦) for that item. */
  private async gatherVendorPricesByItem(): Promise<Map<string, number[]>> {
    const verified = await this.vendors.find({
      where: { verificationStatus: VendorVerificationStatus.VERIFIED },
      select: ['id'],
    });
    const verifiedIds = new Set(verified.map((v) => v.id));

    const rows = await this.vendorPricing
      .createQueryBuilder('vp')
      .where('vp.approvedAt IS NOT NULL')
      .andWhere('vp.effectiveFrom <= NOW()')
      .orderBy('vp.vendorId')
      .addOrderBy('vp.effectiveFrom', 'DESC')
      .getMany();

    // latest approved row per vendor
    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!verifiedIds.has(row.vendorId)) continue;
      if (!latest.has(row.vendorId)) latest.set(row.vendorId, row);
    }

    const map = new Map<string, number[]>();
    for (const vp of latest.values()) {
      for (const item of vp.items) {
        if (!isPriceItemLive(item)) continue; // approved/legacy lines only
        if (!item.itemId || !(item.priceNaira > 0)) continue; // only catalogue-referenced prices
        if (!map.has(item.itemId)) map.set(item.itemId, []);
        map.get(item.itemId)!.push(item.priceNaira);
      }
    }
    return map;
  }

  /** 70th-percentile by linear interpolation (matches PricingIntelligenceService). */
  private percentileValue(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const frac = index - lower;
    return Math.round((sorted[lower] + frac * (sorted[upper] - sorted[lower])) * 100) / 100;
  }
}
