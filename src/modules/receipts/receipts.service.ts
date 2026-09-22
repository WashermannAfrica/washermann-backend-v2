import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Order } from '../../database/entities/order.entity';
import { OrderReceipt, ReceiptParty } from '../../database/entities/order-receipt.entity';
import { OrderFundingLink } from '../../database/entities/order-funding-link.entity';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { User } from '../../database/entities/user.entity';
import { Area } from '../../database/entities/area.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { ReceiptRenderService } from './receipt-render.service';
import { ItemPricingService } from '../pricing/item-pricing.service';
import { UploadService } from '../upload/upload.service';
import {
  ReceiptContact,
  ReceiptModel,
  renderReceiptHtml,
} from './receipt-templates';

const CONTACT: ReceiptContact = {
  website: 'washermann.com',
  email: 'support@washermann.com',
  phone: '+234 904 950 7121',
};

const ACCENT = {
  customer: '#3bf4be',
  vendor: '#e7b64b',
  rep: '#db3c8a',
  platform: '#13c490',
};

const ALL_PARTIES: ReceiptParty[] = ['customer', 'vendor', 'rep', 'platform'];

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);

  constructor(
    @InjectRepository(OrderReceipt) private receiptRepo: Repository<OrderReceipt>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(OrderFundingLink) private fundingRepo: Repository<OrderFundingLink>,
    @InjectRepository(CatalogueItem) private itemRepo: Repository<CatalogueItem>,
    @InjectRepository(Vendor) private vendorRepo: Repository<Vendor>,
    @InjectRepository(Rep) private repRepo: Repository<Rep>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Area) private areaRepo: Repository<Area>,
    private renderService: ReceiptRenderService,
    private itemPricingService: ItemPricingService,
    private uploadService: UploadService,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────────

  /** Generate (or regenerate) and store all four receipt images for a completed order. */
  async generateForOrder(orderId: string): Promise<OrderReceipt[]> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const models = await this.buildModels(order);
    const out: OrderReceipt[] = [];
    for (const party of ALL_PARTIES) {
      const model = models[party];
      const html = renderReceiptHtml(model, this.renderService.wordmark, CONTACT);
      const png = await this.renderService.renderPng(html, 1080);
      const { url, publicId } = await this.uploadService.uploadReceiptImage(order.reference, party, png);
      const existing = await this.receiptRepo.findOne({ where: { orderId, party } });
      const row = existing ?? this.receiptRepo.create({ orderId, party });
      row.url = url;
      row.storageKey = publicId;
      out.push(await this.receiptRepo.save(row));
    }
    this.logger.log(`Generated ${out.length} receipts for order ${order.reference}`);
    return out;
  }

  /** Fire-and-forget wrapper for the completion hook — never throws. */
  async generateForOrderSafe(orderId: string): Promise<void> {
    try {
      await this.generateForOrder(orderId);
    } catch (err) {
      this.logger.error(`Receipt generation failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  /** Receipts the requester is entitled to for this order. */
  async listForRequester(orderId: string, userId: string, roles: string[]) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const allowed = await this.allowedParties(order, userId, roles);
    if (allowed.length === 0) throw new ForbiddenException('You cannot view receipts for this order');

    const rows = await this.receiptRepo.find({ where: { orderId } });
    const byParty = new Map(rows.map((r) => [r.party, r]));
    return {
      orderRef: order.reference,
      generated: rows.length > 0,
      receipts: allowed.map((party) => ({
        party,
        url: byParty.get(party)?.url ?? null,
      })),
    };
  }

  /** One receipt's URL, with authorization. */
  async getOne(orderId: string, party: ReceiptParty, userId: string, roles: string[]) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    const allowed = await this.allowedParties(order, userId, roles);
    if (!allowed.includes(party)) throw new ForbiddenException('You cannot view this receipt');

    const row = await this.receiptRepo.findOne({ where: { orderId, party } });
    if (!row) throw new NotFoundException('Receipt not generated yet');
    return { party, url: row.url };
  }

  // ─── Authorization ───────────────────────────────────────────────────────────

  private async allowedParties(order: Order, userId: string, roles: string[]): Promise<ReceiptParty[]> {
    const isAdmin = roles?.some((r) => [Role.ADMIN, Role.FINANCE].includes(r as Role));
    if (isAdmin) return [...ALL_PARTIES];

    const parties: ReceiptParty[] = [];
    if (order.customerId === userId) parties.push('customer');
    if (order.vendorId) {
      const vendor = await this.vendorRepo.findOne({ where: { id: order.vendorId } });
      if (vendor?.userId === userId) parties.push('vendor');
    }
    if (order.repId) {
      const rep = await this.repRepo.findOne({ where: { id: order.repId } });
      if (rep?.userId === userId) parties.push('rep');
    }
    return parties;
  }

  // ─── Model assembly ─────────────────────────────────────────────────────────────

  private async buildModels(order: Order): Promise<Record<ReceiptParty, ReceiptModel>> {
    const rate = Number(order.conversionRateSnapshot) || 0;
    const wpToNaira = (wp: number | null | undefined) => (rate > 0 ? Math.round((Number(wp) || 0) / rate) : 0);
    const fmtN = (naira: number) => `₦${Math.round(naira).toLocaleString('en-NG')}`;
    const fmtWp = (wp: number) => `${Math.round(wp).toLocaleString('en-NG')} WP`;
    const dateStr = new Date(order.completedAt ?? order.createdAt).toLocaleDateString('en-NG', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const ref = order.reference;
    const snapshot = (order.pricingSnapshot ?? {}) as any;
    const lineItems: Array<{ label: string; qty: number; subtotalWP: number }> = snapshot.lineItems ?? [];
    const charges = snapshot.charges ?? {};

    // Names + related actors.
    const [customer, vendor, rep] = await Promise.all([
      this.userRepo.findOne({ where: { id: order.customerId } }),
      order.vendorId ? this.vendorRepo.findOne({ where: { id: order.vendorId } }) : Promise.resolve(null),
      order.repId ? this.repRepo.findOne({ where: { id: order.repId } }) : Promise.resolve(null),
    ]);
    const repUser = rep ? await this.userRepo.findOne({ where: { id: rep.userId } }) : null;
    const area = await this.areaRepo.findOne({ where: { id: order.areaId } }).catch(() => null);
    const firstName = (customer?.fullName ?? '').trim().split(/\s+/)[0] || 'there';
    const vendorName = vendor?.businessName ?? 'Your washerman';
    const vendorLabel = vendor?.rating ? `${vendorName} · ${Number(vendor.rating).toFixed(1)}` : vendorName;
    const repName = repUser?.fullName ?? 'Your rep';

    // Money splits (₦), platform as residual so the four always reconcile.
    const gross = Math.round(Number(order.nairaEquivalentSnapshot) || wpToNaira(order.totalWP));
    const vendorN = Math.round(Number(order.vendorShareNairaSnapshot) || wpToNaira(order.vendorShareWP));
    const repCommissionN = wpToNaira(order.repShareWP);
    const repTransportN = wpToNaira(order.repTransportWp);
    const repTotalN = repCommissionN + repTransportN;
    const vatN = wpToNaira(charges.vatWP);
    const platformN = Math.max(0, gross - vendorN - repTotalN - vatN);
    const transportChargedN = wpToNaira(order.transportEstimateWp);

    const paidVia = await this.resolvePaidVia(order.id);
    const flowLabel = order.flow === 'wash_iron' ? 'Wash & Iron' : order.flow === 'bundle' ? 'Bundle' : 'Wash & Fold';
    const inclusionsLabel =
      order.flow === 'wash_iron' ? 'Wash & iron, service & VAT' : 'Wash, service & VAT';

    // ── Customer ──
    const customerItemLines = lineItems.map((l) => ({
      label: l.label,
      sub: `×${l.qty}`,
      value: fmtN(wpToNaira(l.subtotalWP)),
    }));
    const customer_: ReceiptModel = {
      party: 'customer',
      accent: ACCENT.customer,
      tag: 'Payment receipt',
      title: `Thanks, ${firstName} — you’re all set`,
      sub: `${ref} · ${dateStr}`,
      amountLabel: 'Total paid',
      amountNaira: fmtN(gross),
      amountSub: `${fmtWp(order.totalWP)} · ${paidVia}`,
      stamp: { text: 'Paid', color: '#13c490' },
      lines: [
        ...customerItemLines,
        { label: inclusionsLabel, value: 'included', kind: 'muted' as const },
        { label: 'Pickup & delivery', sub: 'round trip', value: fmtN(transportChargedN) },
      ],
      total: { label: 'Total', value: fmtN(gross) },
      meta: [
        { k: 'Washerman', v: vendorLabel },
        { k: 'Your rep', v: repName },
        { k: 'Service', v: flowLabel },
        { k: 'Order date', v: dateStr },
      ],
      trust: 'Held in escrow until you confirm delivery — released to your washerman only then.',
    };

    // ── Vendor ──
    const vendorLines = await this.buildVendorLines(order, lineItems, fmtN, vendorN);
    const garments = this.garmentCount(order);
    const vendor_: ReceiptModel = {
      party: 'vendor',
      accent: ACCENT.vendor,
      tag: 'Vendor earnings',
      title: vendorName,
      sub: `${ref} · settled ${dateStr}`,
      amountLabel: 'Your payout',
      amountNaira: fmtN(vendorN),
      amountSub: `${fmtWp(order.vendorShareWP ?? 0)} · your quoted prices`,
      stamp: { text: 'Earned', color: '#a9832a' },
      lines: vendorLines,
      total: { label: 'Payout', sub: `${garments} garments logged`, value: fmtN(vendorN) },
      meta: [
        { k: 'Service', v: flowLabel },
        { k: 'Chosen by', v: order.allocationMode === 'choose' ? 'Customer (direct)' : 'Auto-allocated' },
        { k: 'Picked up by', v: repName },
        { k: 'Payout ref', v: `PL-V-${refTail(ref)}` },
      ],
      trust: 'Paid from escrow on delivery. You are paid your own prices per garment — platform charges are separate.',
    };

    // ── Rep ──
    const rep_: ReceiptModel = {
      party: 'rep',
      accent: ACCENT.rep,
      tag: 'Earnings slip',
      title: repName,
      sub: `${ref} · settled ${dateStr}`,
      amountLabel: 'You earned',
      amountNaira: fmtN(repTotalN),
      amountSub: `${fmtWp((order.repShareWP ?? 0) + (order.repTransportWp ?? 0))} · to pseudo-wallet`,
      stamp: { text: 'Earned', color: '#db3c8a' },
      lines: [
        { label: 'Handling commission', sub: 'garment handling share', value: fmtN(repCommissionN), kind: 'plus' as const },
        { label: 'Transport', sub: 'round trip', value: fmtN(repTransportN), kind: 'plus' as const },
      ],
      total: { label: 'Total earnings', value: fmtN(repTotalN) },
      meta: [
        { k: 'Garments handled', v: `${garments} pieces` },
        { k: 'Washerman', v: vendorName },
        { k: 'Area', v: area?.name ?? '—' },
        { k: 'Payout ref', v: `PL-R-${refTail(ref)}` },
      ],
      trust: 'Transport is paid at actual, capped at the estimate charged to the customer.',
    };

    // ── Platform ──
    const platform_: ReceiptModel = {
      party: 'platform',
      accent: ACCENT.platform,
      tag: 'Settlement',
      title: 'Order settlement',
      sub: `${ref} · ${dateStr}`,
      amountLabel: 'Net platform margin',
      amountNaira: fmtN(platformN),
      amountSub: `${fmtWp(order.platformShareWP ?? 0)} · after all splits`,
      lines: [
        { label: 'Gross received', value: fmtN(gross) },
        { label: 'Vendor payout', value: fmtN(vendorN), kind: 'minus' as const },
        { label: 'Rep earnings', sub: 'commission + transport', value: fmtN(repTotalN), kind: 'minus' as const },
        { label: 'VAT remitted', sub: 'pass-through', value: fmtN(vatN), kind: 'minus' as const },
      ],
      total: { label: 'Net margin', value: fmtN(platformN) },
      meta: [
        { k: 'Allocation', v: order.allocationMode === 'choose' ? 'Choose-Washerman' : 'Automatic' },
        { k: 'Escrow', v: 'Released' },
        { k: 'Conversion', v: rate > 0 ? `₦${(1 / rate).toFixed(2)} / WP` : '—' },
        { k: 'Reconciled', v: 'Balanced' },
      ],
      trust: 'Internal settlement record — every naira received has a destination.',
    };

    return { customer: customer_, vendor: vendor_, rep: rep_, platform: platform_ };
  }

  private async buildVendorLines(
    order: Order,
    lineItems: Array<{ label: string; qty: number; subtotalWP: number }>,
    fmtN: (n: number) => string,
    vendorN: number,
  ) {
    const selections = order.itemSelections ?? [];
    if (order.flow === 'wash_iron' && selections.length && order.vendorId) {
      const ids = selections.map((s) => s.itemId);
      const [items, vprices] = await Promise.all([
        this.itemRepo.find({ where: { id: In(ids) } }),
        this.itemPricingService.getVendorItemPrices(order.vendorId),
      ]);
      const nameById = new Map(items.map((i) => [i.id, i.name]));
      return selections.map((s) => {
        const unit = vprices.get(s.itemId) ?? null;
        const name = nameById.get(s.itemId) ?? 'Item';
        return {
          label: name,
          sub: unit != null ? `${s.qty} × ${fmtN(unit)}` : `×${s.qty}`,
          value: unit != null ? fmtN(unit * s.qty) : '—',
        };
      });
    }
    // wash_fold / bundle — a single product line.
    const first = lineItems[0];
    return [{ label: first?.label ?? 'Order', value: fmtN(vendorN) }];
  }

  private garmentCount(order: Order): number {
    const selections = order.itemSelections ?? [];
    if (selections.length) return selections.reduce((s, i) => s + (i.qty ?? 0), 0);
    const log = order.garmentLog as any;
    if (typeof log === 'number') return log;
    if (log && typeof log.count === 'number') return log.count;
    return 0;
  }

  private async resolvePaidVia(orderId: string): Promise<string> {
    const link = await this.fundingRepo.findOne({ where: { orderId, status: 'paid' } });
    if (!link) return 'from Wallet';
    if (link.purpose === 'sponsor') {
      return link.sponsorName ? `Sponsored by ${link.sponsorName}` : 'Sponsored';
    }
    return 'paid by card';
  }
}

/** Short tail of an order reference for payout refs (keeps them compact). */
function refTail(ref: string): string {
  return ref.replace(/[^0-9]/g, '').slice(-4) || ref.slice(-4);
}
