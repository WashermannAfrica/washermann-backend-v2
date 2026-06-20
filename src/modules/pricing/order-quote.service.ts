import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { Bag } from '../../database/entities/bag.entity';
import { Bundle } from '../../database/entities/bundle.entity';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PricingService } from './pricing.service';

export interface ItemSelection {
  itemId: string;
  qty:    number;
}

export interface QuoteLine {
  itemId:     string;
  name:       string;
  qty:        number;
  unitNgn:    number;   // item price incl. ironing where applicable
  subtotalNgn: number;
}

export interface Quote {
  flow:      'wash_iron' | 'wash_fold' | 'bundle';
  lines:     QuoteLine[];
  totalNgn:  number;
  totalWp:   number;
  conversionRateId: string;
  conversionRateSnapshot: number;
  calculatedAt: string;
}

/**
 * Read-side pricing for the order flows. Computes the authoritative customer
 * total from cached catalogue/bag prices. The same logic backs both the
 * frontend's live total and the server-side recheck at order creation.
 *
 *   wash_iron:  Σ ( itemPrice × (1 + ironing%) ) × qty
 *   wash_fold:  the bag's cached price (P70 of everyday items × capacity)
 */
@Injectable()
export class OrderQuoteService {
  constructor(
    @InjectRepository(CatalogueItem) private items: Repository<CatalogueItem>,
    @InjectRepository(Bag) private bags: Repository<Bag>,
    @InjectRepository(Bundle) private bundles: Repository<Bundle>,
    private platformConfigService: PlatformConfigService,
    private pricingService: PricingService,
  ) {}

  async quoteWashIron(selections: ItemSelection[]): Promise<Quote> {
    if (!selections?.length) throw new BadRequestException('No items selected');

    const [config, rate] = await Promise.all([
      this.platformConfigService.getConfig(),
      this.pricingService.getActiveConversionRate(),
    ]);
    const ironingMult = 1 + Number(config.ironingPercent ?? 0) / 100;

    const ids = [...new Set(selections.map((s) => s.itemId))];
    const items = await this.items.find({ where: { id: In(ids) } });
    const byId = new Map(items.map((i) => [i.id, i]));

    const lines: QuoteLine[] = [];
    let totalNgn = 0;
    for (const sel of selections) {
      const item = byId.get(sel.itemId);
      if (!item) throw new NotFoundException(`Item not found: ${sel.itemId}`);
      if (!item.isActive || !item.isAvailable || item.priceNgn == null) {
        throw new BadRequestException(`Item not available for ordering: ${item.name}`);
      }
      if (!(sel.qty > 0)) throw new BadRequestException(`Invalid quantity for ${item.name}`);

      const unitNgn = Math.round(item.priceNgn * ironingMult * 100) / 100;
      const subtotalNgn = Math.round(unitNgn * sel.qty * 100) / 100;
      totalNgn += subtotalNgn;
      lines.push({ itemId: item.id, name: item.name, qty: sel.qty, unitNgn, subtotalNgn });
    }

    totalNgn = Math.round(totalNgn * 100) / 100;
    return {
      flow: 'wash_iron', lines, totalNgn,
      totalWp: Math.round(totalNgn * rate.pointsPerUnit),
      conversionRateId: rate.id, conversionRateSnapshot: rate.pointsPerUnit,
      calculatedAt: new Date().toISOString(),
    };
  }

  async quoteBag(bagId: string): Promise<Quote> {
    const [bag, rate] = await Promise.all([
      this.bags.findOne({ where: { id: bagId } }),
      this.pricingService.getActiveConversionRate(),
    ]);
    if (!bag) throw new NotFoundException('Bag not found');
    if (!bag.isActive || bag.priceNgn == null) throw new BadRequestException('Bag not available for ordering');

    return {
      flow: 'wash_fold',
      lines: [{ itemId: bag.id, name: bag.name, qty: 1, unitNgn: bag.priceNgn, subtotalNgn: bag.priceNgn }],
      totalNgn: bag.priceNgn,
      totalWp: bag.priceWp ?? Math.round(bag.priceNgn * rate.pointsPerUnit),
      conversionRateId: rate.id, conversionRateSnapshot: rate.pointsPerUnit,
      calculatedAt: new Date().toISOString(),
    };
  }

  async quoteBundle(bundleId: string): Promise<Quote> {
    const [bundle, rate] = await Promise.all([
      this.bundles.findOne({ where: { id: bundleId } }),
      this.pricingService.getActiveConversionRate(),
    ]);
    if (!bundle) throw new NotFoundException('Bundle not found');
    if (!bundle.isActive || bundle.effectivePriceNgn == null) {
      throw new BadRequestException('Bundle not available for ordering');
    }
    if (bundle.expiresAt && bundle.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Bundle has expired');
    }
    return {
      flow: 'bundle',
      lines: [{ itemId: bundle.id, name: bundle.name, qty: 1, unitNgn: bundle.effectivePriceNgn, subtotalNgn: bundle.effectivePriceNgn }],
      totalNgn: bundle.effectivePriceNgn,
      totalWp: bundle.effectivePriceWp ?? Math.round(bundle.effectivePriceNgn * rate.pointsPerUnit),
      conversionRateId: rate.id, conversionRateSnapshot: rate.pointsPerUnit,
      calculatedAt: new Date().toISOString(),
    };
  }
}
