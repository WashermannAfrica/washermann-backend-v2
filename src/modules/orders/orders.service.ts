import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { isPriceItemLive } from '../../database/entities/vendor-pricing.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderEscrow } from '../../database/entities/order-escrow.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { RatingEvent } from '../../database/entities/rating-event.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PlaceOrderDto } from './dto/place-order.dto';
import { LogGarmentCountDto } from './dto/garment-log.dto';
import { RateOrderDto } from './dto/rate-order.dto';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { PricingService } from '../pricing/pricing.service';
import { OrderQuoteService, Quote } from '../pricing/order-quote.service';
import { ReferralsService } from '../referrals/referrals.service';
import { VendorsService } from '../vendors/vendors.service';
import { RepsService } from '../reps/reps.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(OrderEscrow)
    private escrowRepository: Repository<OrderEscrow>,

    @InjectRepository(OrderStatusHistory)
    private statusHistoryRepository: Repository<OrderStatusHistory>,

    @InjectRepository(RatingEvent)
    private ratingEventRepository: Repository<RatingEvent>,

    @InjectRepository(Rep)
    private repRepository: Repository<Rep>,

    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,

    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,

    @InjectRepository(LedgerEntry)
    private ledgerRepository: Repository<LedgerEntry>,

    @InjectRepository(ConversionRate)
    private conversionRateRepository: Repository<ConversionRate>,

    private pricingService: PricingService,
    private orderQuoteService: OrderQuoteService,
    private referralsService: ReferralsService,
    private vendorsService: VendorsService,
    private repsService: RepsService,
    private platformConfigService: PlatformConfigService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  // ─── Place order ─────────────────────────────────────────────────────────────

  /** Resolve the authoritative quote for the order's flow, validating its required fields. */
  private async quoteForFlow(dto: PlaceOrderDto): Promise<Quote> {
    if (dto.flow === 'wash_iron') {
      if (!dto.selections?.length) {
        throw new BadRequestException('selections are required for a wash_iron order');
      }
      return this.orderQuoteService.quoteWashIron(dto.selections);
    }
    if (dto.flow === 'wash_fold') {
      if (!dto.bagId) throw new BadRequestException('bagId is required for a wash_fold order');
      return this.orderQuoteService.quoteBag(dto.bagId);
    }
    if (!dto.bundleId) throw new BadRequestException('bundleId is required for a bundle order');
    return this.orderQuoteService.quoteBundle(dto.bundleId);
  }

  /**
   * Decompose an order total into its charge components for escrow reconciliation.
   *
   * Every catalogue item price = base × (1 + Σ charge%), and wash_iron adds a
   * uniform ironing layer on top, so the base and each percentage charge can be
   * recovered by ratio. Fixed (non-percent) charges aren't decomposed here — they
   * fold into the platform remainder. Snapshotted at placement so later config
   * changes never alter a placed order's split.
   */
  private decomposeCharges(
    totalWp: number,
    flow: PlaceOrderDto['flow'],
    config: { chargeStack?: { key: string; kind: string; value: number }[]; ironingPercent?: number },
  ): { baseWP: number; commissionWP: number; vatWP: number } {
    const stack = config.chargeStack ?? [];
    const sumPct = stack.filter((c) => c.kind === 'percent').reduce((s, c) => s + Number(c.value), 0);
    const commissionPct = Number(stack.find((c) => c.key === 'wash_rep_commission')?.value ?? 0);
    const vatPct = Number(stack.find((c) => c.key === 'vat')?.value ?? 0);
    const I = flow === 'wash_iron' ? Number(config.ironingPercent ?? 0) / 100 : 0;
    const S = sumPct / 100;
    const baseWP = Math.round(totalWp / ((1 + S) * (1 + I)));
    return {
      baseWP,
      commissionWP: Math.round(baseWP * (commissionPct / 100)),
      vatWP: Math.round(baseWP * (vatPct / 100)),
    };
  }

  async placeOrder(customerId: string, dto: PlaceOrderDto) {
    // 0. Profile-completion gate — customer must have phone + saved address
    await this.usersService.assertOrderEligibility(customerId);

    // 1. Authoritative quote for the chosen flow (server-side; client prices ignored)
    const quote = await this.quoteForFlow(dto);

    // Shape the quote into the pricing snapshot the rest of the method consumes.
    const pricing = {
      lineItems: quote.lines.map((l) => ({
        label:       l.name,
        category:    (dto.flow === 'wash_fold' ? 'bag' : 'special_item') as 'bag' | 'special_item',
        unitPriceWP: Math.round(l.unitNgn * quote.conversionRateSnapshot),
        qty:         l.qty,
        subtotalWP:  Math.round(l.subtotalNgn * quote.conversionRateSnapshot),
      })),
      subtotalWP:             quote.totalWp,
      serviceChargeWP:        0,
      vatWP:                  0,
      transportWP:            0,
      totalWP:                quote.totalWp,
      nairaEquivalent:        quote.totalNgn,
      conversionRateId:       quote.conversionRateId,
      conversionRateSnapshot: quote.conversionRateSnapshot,
      calculatedAt:           quote.calculatedAt,
      // Charge decomposition, frozen for escrow reconciliation at completion.
      charges:                this.decomposeCharges(quote.totalWp, dto.flow, await this.platformConfigService.getConfig()),
    };

    // 2. Check wallet has enough WP
    const wallet = await this.walletRepository.findOne({ where: { userId: customerId } });
    if (!wallet) throw new NotFoundException('User wallet not found');
    if (wallet.balance < pricing.totalWP) {
      throw new BadRequestException(
        `Insufficient WashPoints. Required: ${pricing.totalWP} WP, Available: ${wallet.balance} WP`,
      );
    }

    // 3. Generate order reference
    const ref = await this.generateReference();

    return this.dataSource.transaction(async (manager) => {
      // 4. Debit user wallet — also proportionally reduce fiatBalanceKobo (WACB method)
      const balanceBefore     = wallet.balance;
      const fiatBefore        = wallet.fiatBalanceKobo ?? 0;
      const debitWP           = pricing.totalWP;
      // Proportional fiat deduction: (debitWP / balanceBefore) × fiatBefore
      const fiatDeductKobo    = balanceBefore > 0
        ? Math.round((debitWP / balanceBefore) * fiatBefore)
        : 0;
      wallet.balance         -= debitWP;
      wallet.fiatBalanceKobo  = Math.max(0, fiatBefore - fiatDeductKobo);
      await manager.save(wallet);

      // 5. Write ledger entry
      const ledgerEntry = manager.create(LedgerEntry, {
        walletId:                wallet.id,
        userId:                  customerId,
        type:                    'debit',
        amount:                  pricing.totalWP,
        balanceBefore,
        balanceAfter:            wallet.balance,
        source:                  LedgerSource.ORDER_DEBIT,
        conversionRateId:        pricing.conversionRateId,
        conversionRateSnapshot:  pricing.conversionRateSnapshot,
        reference:               ref,
        description:             `Order payment: ${ref}`,
        metadata:                null,
        vaultId:                 null,
        fiatAmountKobo:          null,
        fiatCurrency:            null,
      });
      await manager.save(ledgerEntry);

      // 6. Create order
      const order = manager.create(Order, {
        reference:               ref,
        customerId,
        companyId:               dto.companyId ?? null,
        repId:                   null,
        vendorId:                null,
        areaId:                  dto.areaId,
        flow:                    dto.flow,
        bagId:                   dto.flow === 'wash_fold' ? dto.bagId ?? null : null,
        itemSelections:          dto.flow === 'wash_iron' ? (dto.selections ?? null) : null,
        bundleId:                dto.flow === 'bundle' ? dto.bundleId ?? null : null,
        serviceType:             dto.flow === 'bundle' ? 'wash_fold' : dto.flow,
        bagSize:                 null,
        specialItems:            [],
        ironingCount:            0,
        pickupAddress:           dto.pickupAddress,
        pickupLatitude:          dto.pickupLatitude ?? null,
        pickupLongitude:         dto.pickupLongitude ?? null,
        scheduledPickupAt:       new Date(dto.scheduledPickupAt),
        specialInstructions:     dto.specialInstructions ?? null,
        pricingSnapshot:         pricing as any,
        totalWP:                 pricing.totalWP,
        nairaEquivalentSnapshot: pricing.nairaEquivalent,
        conversionRateSnapshot:  pricing.conversionRateSnapshot,
        conversionRateId:        pricing.conversionRateId,
        vendorShareWP:           null,
        vendorShareNairaSnapshot: null,
        repShareWP:              null,
        platformShareWP:         null,
        garmentLog:              null,
        status:                  OrderStatus.PAID,
        autoCompleteAt:          null,
      });
      await manager.save(order);

      // 7. Create escrow
      const escrow = manager.create(OrderEscrow, {
        orderId:           order.id,
        wpAmount:          pricing.totalWP,
        nairaEquivalent:   pricing.nairaEquivalent,
        conversionRateId:  pricing.conversionRateId,
        status:            'held',
      });
      await manager.save(escrow);

      // 8. Write status history
      await manager.save(
        manager.create(OrderStatusHistory, {
          orderId:         order.id,
          fromStatus:      null,
          toStatus:        OrderStatus.PAID,
          triggeredBy:     customerId,
          triggeredByRole: 'customer',
          note:            'Order placed and paid',
        }),
      );

      // 9. Fire order-placed notifications (fire-and-forget)
      this.notificationsService.notifyOrderPlaced({
        customerId:        customerId,
        orderRef:          ref,
        totalWP:           pricing.totalWP,
        nairaEquivalent:   pricing.nairaEquivalent,
        pickupAddress:     dto.pickupAddress,
        scheduledPickupAt: new Date(dto.scheduledPickupAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
      });

      return { order, pricing };
    });
  }

  // ─── List orders (admin / customer) ──────────────────────────────────────────

  async findAll(query: {
    page?: number;
    limit?: number;
    customerId?: string;
    repId?: string;
    vendorId?: string;
    status?: OrderStatus;
    areaId?: string;
  }) {
    const page  = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const qb = this.orderRepository
      .createQueryBuilder('o')
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.customerId) qb.andWhere('o.customerId = :c', { c: query.customerId });
    if (query.repId)      qb.andWhere('o.repId = :r', { r: query.repId });
    if (query.vendorId)   qb.andWhere('o.vendorId = :v', { v: query.vendorId });
    if (query.status)     qb.andWhere('o.status = :s', { s: query.status });
    if (query.areaId)     qb.andWhere('o.areaId = :a', { a: query.areaId });

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─── Get one order ────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findByReference(ref: string) {
    const order = await this.orderRepository.findOne({ where: { reference: ref } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ─── Status transitions (triggered by rep, vendor, customer, system) ─────────

  async transition(
    orderId: string,
    toStatus: OrderStatus,
    triggeredBy: string | null,
    role: 'system' | 'customer' | 'rep' | 'vendor' | 'admin',
    note?: string,
  ) {
    const order = await this.findOne(orderId);

    const prev = order.status;
    order.status = toStatus;

    // Set auto-complete timestamp when delivered
    if (toStatus === OrderStatus.DELIVERED) {
      const config = await this.platformConfigService.getConfig();
      const hoursMs = config.orderAutoCompleteHours * 60 * 60 * 1000;
      order.autoCompleteAt = new Date(Date.now() + hoursMs);
    }

    if (toStatus === OrderStatus.COMPLETED) {
      order.completedAt = new Date();
    }

    if (toStatus === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();
    }

    await this.orderRepository.save(order);

    await this.statusHistoryRepository.save(
      this.statusHistoryRepository.create({
        orderId,
        fromStatus: prev,
        toStatus,
        triggeredBy,
        triggeredByRole: role,
        note: note ?? null,
      }),
    );

    // Fire transition-based notifications
    if (toStatus === OrderStatus.PICKED_UP) {
      this.notificationsService.notifyOrderPickedUp({
        customerId: order.customerId,
        vendorId:   order.vendorId!,
        repId:      order.repId!,
        orderRef:   order.reference,
      });
    }
    if (toStatus === OrderStatus.DELIVERED) {
      this.notificationsService.notifyOrderDelivered({
        customerId: order.customerId,
        vendorId:   order.vendorId,
        repId:      order.repId,
        orderRef:   order.reference,
      });
    }

    return order;
  }

  // ─── Rep logs garment count at pickup ────────────────────────────────────────

  async logGarmentCount(orderId: string, repUserId: string, dto: LogGarmentCountDto) {
    const order = await this.findOne(orderId);

    // Verify the rep is assigned to this order
    if (order.repId) {
      const rep = await this.repRepository.findOne({ where: { id: order.repId } });
      if (!rep || rep.userId !== repUserId) {
        throw new ForbiddenException('You are not assigned to this order');
      }
    }

    if (order.status !== OrderStatus.PICKED_UP && order.status !== OrderStatus.WITH_VENDOR) {
      throw new BadRequestException('Garment count can only be logged at pickup');
    }

    // Calculate vendor share from garment log
    const vendorShareCalc = await this.calculateVendorShare(order.vendorId!, dto.garmentLog);
    const config          = await this.platformConfigService.getConfig();
    const rate            = await this.pricingService.getActiveConversionRate();

    const vendorShareWP          = vendorShareCalc.totalWP;
    const vendorShareNairaSnapshot = vendorShareCalc.totalNaira;
    // Rep share = the wash-rep commission baked into the price (the charge funds the
    // rep). Falls back to the legacy flat repSharePercent for pre-catalogue orders.
    const snapCharges            = (order.pricingSnapshot as any).charges;
    const repShareWP             = snapCharges?.commissionWP != null
      ? snapCharges.commissionWP
      : Math.floor(order.totalWP * (config.repSharePercent / 100));
    const transportWP            = (order.pricingSnapshot as any).transportWP ?? 0;
    const platformShareWP        = order.totalWP - vendorShareWP - repShareWP - transportWP;

    order.garmentLog              = dto.garmentLog;
    order.vendorShareWP           = vendorShareWP;
    order.vendorShareNairaSnapshot = vendorShareNairaSnapshot;
    order.repShareWP              = repShareWP;
    order.platformShareWP         = Math.max(0, platformShareWP);

    await this.orderRepository.save(order);

    // Transition to WITH_VENDOR
    await this.transition(orderId, OrderStatus.WITH_VENDOR, repUserId, 'rep', dto.note);

    return order;
  }

  // ─── Complete order & release escrow ─────────────────────────────────────────

  async completeOrder(orderId: string, triggeredBy: string | null, role: 'customer' | 'system' | 'admin') {
    const order = await this.findOne(orderId);

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order must be in delivered status to complete');
    }
    if (!order.vendorShareWP || !order.repShareWP || order.platformShareWP == null) {
      throw new BadRequestException('Earnings split not yet calculated — garment count must be logged first');
    }

    return this.dataSource.transaction(async (manager) => {
      // Release escrow
      const escrow = await this.escrowRepository.findOne({ where: { orderId } });
      if (escrow) {
        escrow.status     = 'released';
        escrow.releasedAt = new Date();
        await manager.save(escrow);
      }

      // Credit vendor wallet
      if (order.vendorId && order.vendorShareWP! > 0) {
        await this.vendorsService.creditWallet(
          order.vendorId,
          order.vendorShareWP!,
          LedgerSource.VENDOR_EARNING,
          `Order completion: ${order.reference}`,
          { orderId, nairaSnapshot: order.vendorShareNairaSnapshot ?? undefined, reference: order.reference },
        );
      }

      // Credit rep pseudo-wallet
      if (order.repId && order.repShareWP! > 0) {
        await this.repsService.creditWallet(
          order.repId,
          order.repShareWP!,
          LedgerSource.REP_EARNING,
          `Order completion: ${order.reference}`,
          { orderId, reference: order.reference },
        );
      }

      // Mark completed
      order.status      = OrderStatus.COMPLETED;
      order.completedAt = new Date();
      await manager.save(order);

      await manager.save(
        manager.create(OrderStatusHistory, {
          orderId,
          fromStatus: OrderStatus.DELIVERED,
          toStatus:   OrderStatus.COMPLETED,
          triggeredBy,
          triggeredByRole: role,
          note: role === 'system' ? 'Auto-completed after 24h' : 'Customer confirmed delivery',
        }),
      );

      // Fire completion notifications (fire-and-forget)
      this.notificationsService.notifyOrderCompleted({
        customerId:      order.customerId,
        vendorId:        order.vendorId,
        repId:           order.repId,
        orderRef:        order.reference,
        vendorShareWP:   order.vendorShareWP ?? 0,
        repShareWP:      order.repShareWP ?? 0,
        nairaEquivalent: order.vendorShareNairaSnapshot ?? 0,
      });

      // Referral: a completed order is the customer-leg unlock trigger (fire-and-forget).
      this.referralsService
        .onRefereeQualified(order.customerId, 'customer', { wp: order.totalWP, ngn: order.nairaEquivalentSnapshot ?? 0 })
        .catch((err) => this.logger.error(`Referral unlock (order) failed: ${err.message}`));

      return order;
    });
  }

  // ─── Cancel order ─────────────────────────────────────────────────────────────

  async cancelOrder(
    orderId: string,
    customerId: string,
    reason: string,
  ) {
    const order = await this.findOne(orderId);

    // Only customer's own orders
    if (order.customerId !== customerId) throw new ForbiddenException('Access denied');

    // Cannot cancel once picked up
    if ([
      OrderStatus.PICKED_UP, OrderStatus.WITH_VENDOR, OrderStatus.IN_PROGRESS,
      OrderStatus.QUALITY_CHECK, OrderStatus.READY_FOR_DELIVERY, OrderStatus.REP_COLLECTED,
      OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.COMPLETED,
    ].includes(order.status)) {
      throw new BadRequestException('Order cannot be cancelled at this stage');
    }

    return this.dataSource.transaction(async (manager) => {
      // Refund user wallet
      const wallet = await this.walletRepository.findOne({ where: { userId: customerId } });
      if (wallet) {
        const balanceBefore  = wallet.balance;
        wallet.balance      += order.totalWP;
        await manager.save(wallet);

        await manager.save(
          manager.create(LedgerEntry, {
            walletId:               wallet.id,
            userId:                 customerId,
            type:                   'credit',
            amount:                 order.totalWP,
            balanceBefore,
            balanceAfter:           wallet.balance,
            source:                 LedgerSource.CANCELLATION_REFUND,
            conversionRateId:       null,
            conversionRateSnapshot: null,
            reference:              order.reference,
            description:            `Refund for cancelled order: ${order.reference}`,
            metadata:               null,
            vaultId:                null,
            fiatAmountKobo:         null,
            fiatCurrency:           null,
          }),
        );
      }

      // Release escrow
      const escrow = await this.escrowRepository.findOne({ where: { orderId } });
      if (escrow) {
        escrow.status = 'refunded';
        escrow.releasedAt = new Date();
        await manager.save(escrow);
      }

      // Mark cancelled
      order.status             = OrderStatus.CANCELLED;
      order.cancelledAt        = new Date();
      order.cancellationReason = reason;
      await manager.save(order);

      await manager.save(
        manager.create(OrderStatusHistory, {
          orderId,
          fromStatus: order.status,
          toStatus:   OrderStatus.CANCELLED,
          triggeredBy: customerId,
          triggeredByRole: 'customer',
          note: reason,
        }),
      );

      // Fire cancellation notification (fire-and-forget)
      this.notificationsService.notifyOrderCancelled({
        customerId: customerId,
        orderRef:   order.reference,
        totalWP:    order.totalWP,
      });

      return order;
    });
  }

  // ─── Rate order ───────────────────────────────────────────────────────────────

  async rateOrder(orderId: string, customerId: string, dto: RateOrderDto) {
    const order = await this.findOne(orderId);

    if (order.customerId !== customerId) throw new ForbiddenException('Access denied');
    if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Can only rate delivered or completed orders');
    }
    if (order.ratedAt) throw new BadRequestException('This order has already been rated');

    const event = this.ratingEventRepository.create({
      orderId,
      customerId,
      repId:      order.repId,
      vendorId:   order.vendorId,
      repScore:   dto.repScore ?? null,
      vendorScore: dto.vendorScore ?? null,
      comment:    dto.comment ?? null,
    });
    await this.ratingEventRepository.save(event);

    // Update rolling 30-day averages
    if (dto.repScore && order.repId) {
      await this.updateRepRating(order.repId);
    }
    if (dto.vendorScore && order.vendorId) {
      await this.updateVendorRating(order.vendorId);
    }

    order.ratedAt = new Date();
    await this.orderRepository.save(order);

    return event;
  }

  // ─── Get status history ───────────────────────────────────────────────────────

  async getStatusHistory(orderId: string) {
    return this.statusHistoryRepository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Vendor share calculation ─────────────────────────────────────────────────

  private async calculateVendorShare(vendorId: string, garmentLog: Record<string, number>) {
    const activePricing = await this.vendorsService.getActivePricing(vendorId);
    const rate          = await this.pricingService.getActiveConversionRate();

    let totalNaira = 0;
    if (activePricing) {
      const priceMap: Record<string, number> = {};
      for (const item of activePricing.items) {
        if (!isPriceItemLive(item)) continue; // skip pending/rejected price lines
        priceMap[item.garmentType] = item.priceNaira;
      }
      for (const [garmentType, count] of Object.entries(garmentLog)) {
        const priceNaira = priceMap[garmentType] ?? 0;
        totalNaira += priceNaira * count;
      }
    }

    const totalWP = Math.round(totalNaira * rate.pointsPerUnit);
    return { totalNaira, totalWP };
  }

  // ─── Rating recalculation ─────────────────────────────────────────────────────

  private async updateRepRating(repId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.ratingEventRepository
      .createQueryBuilder('r')
      .select('AVG(r.repScore)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.repId = :repId', { repId })
      .andWhere('r.submittedAt >= :since', { since: thirtyDaysAgo })
      .andWhere('r.repScore IS NOT NULL')
      .getRawOne();

    const rep = await this.repRepository.findOne({ where: { id: repId } });
    if (!rep) return;

    rep.rating      = parseFloat(result.avg ?? '0');
    rep.ratingCount = (rep.ratingCount ?? 0) + 1;

    // Check if below threshold
    const config = await this.platformConfigService.getConfig();
    if (rep.rating < config.lowRatingThreshold && rep.rating > 0) {
      rep.flaggedForReview = true;
      rep.flaggedAt        = new Date();
    }

    await this.repRepository.save(rep);
  }

  private async updateVendorRating(vendorId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await this.ratingEventRepository
      .createQueryBuilder('r')
      .select('AVG(r.vendorScore)', 'avg')
      .addSelect('COUNT(r.id)', 'count')
      .where('r.vendorId = :vendorId', { vendorId })
      .andWhere('r.submittedAt >= :since', { since: thirtyDaysAgo })
      .andWhere('r.vendorScore IS NOT NULL')
      .getRawOne();

    const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
    if (!vendor) return;

    vendor.rating      = parseFloat(result.avg ?? '0');
    vendor.ratingCount = (vendor.ratingCount ?? 0) + 1;
    await this.vendorRepository.save(vendor);
  }

  // ─── Reference generator ──────────────────────────────────────────────────────

  private async generateReference(): Promise<string> {
    const date    = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const count   = await this.orderRepository.count();
    const seq     = String(count + 1).padStart(6, '0');
    return `WM-ORD-${dateStr}-${seq}`;
  }
}
