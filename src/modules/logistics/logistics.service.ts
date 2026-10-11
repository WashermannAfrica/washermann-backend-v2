import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Order, OrderFlow, LogisticsRecipient, isLogisticsFlow } from '../../database/entities/order.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { TransportService } from '../transport/transport.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { PricingService } from '../pricing/pricing.service';
import { AreasService } from '../areas/areas.service';
import { OrdersService } from '../orders/orders.service';
import { OrderFundingService } from '../orders/order-funding.service';
import { WalletsService } from '../wallets/wallets.service';

interface Coord { latitude: number; longitude: number }

export interface CreateLogisticsInput {
  vendorId: string;                 // the platform vendor (counterparty) — required in all flows
  recipient?: LogisticsRecipient;   // ad-hoc counterparty (vendor-initiated flows)
  scheduledPickupAt?: string;
  note?: string;
  roundTrip?: boolean;              // vendor-initiated: this collect leg is half of a round trip
}

@Injectable()
export class LogisticsService {
  private readonly logger = new Logger(LogisticsService.name);

  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Vendor) private vendorRepo: Repository<Vendor>,
    private transportService: TransportService,
    private platformConfigService: PlatformConfigService,
    private pricingService: PricingService,
    private areasService: AreasService,
    private ordersService: OrdersService,
    private orderFundingService: OrderFundingService,
    private walletsService: WalletsService,
    private dataSource: DataSource,
  ) {}

  // ─── Public creators ─────────────────────────────────────────────────────────

  /** Vendor-initiated: rep delivers the vendor's clean clothes to a recipient. */
  async createDelivery(requesterUserId: string, input: CreateLogisticsInput) {
    const vendor = await this.requireLocatedVendorOwnedBy(input.vendorId, requesterUserId);
    const recipient = this.requireRecipient(input.recipient);
    return this.createLeg({
      flow: 'logistics_delivery',
      requesterType: 'vendor',
      ownerUserId: requesterUserId,
      vendor,
      from: { latitude: vendor.latitude!, longitude: vendor.longitude! },
      fromAddress: vendor.businessName ?? 'Vendor shop',
      to: { latitude: recipient.latitude, longitude: recipient.longitude },
      recipient,
      scheduledPickupAt: input.scheduledPickupAt,
      note: input.note,
    });
  }

  /** Vendor-initiated: rep collects a recipient's clothes and brings them to the vendor. */
  async createCollect(requesterUserId: string, input: CreateLogisticsInput) {
    const vendor = await this.requireLocatedVendorOwnedBy(input.vendorId, requesterUserId);
    const recipient = this.requireRecipient(input.recipient);
    return this.createLeg({
      flow: 'logistics_collect',
      requesterType: 'vendor',
      ownerUserId: requesterUserId,
      vendor,
      from: { latitude: recipient.latitude, longitude: recipient.longitude },
      fromAddress: recipient.address,
      to: { latitude: vendor.latitude!, longitude: vendor.longitude! },
      recipient,
      scheduledPickupAt: input.scheduledPickupAt,
      note: input.note,
      roundTrip: input.roundTrip,
    });
  }

  /**
   * Customer-initiated: the customer already handed clothes to a platform vendor
   * off-app and wants a rep to bring them back (vendor → customer).
   */
  async createCustomerCollect(
    customerUserId: string,
    input: { vendorId: string; customerAddress: string; latitude: number; longitude: number; scheduledPickupAt?: string; note?: string },
  ) {
    const vendor = await this.requireLocatedVendor(input.vendorId);
    if (!(input.latitude != null && input.longitude != null)) {
      throw new BadRequestException('Your delivery coordinates are required');
    }
    return this.createLeg({
      flow: 'logistics_delivery',
      requesterType: 'customer',
      ownerUserId: customerUserId,
      vendor,
      from: { latitude: vendor.latitude!, longitude: vendor.longitude! },
      fromAddress: vendor.businessName ?? 'Vendor shop',
      to: { latitude: input.latitude, longitude: input.longitude },
      recipient: null,
      customerAddress: input.customerAddress,
      scheduledPickupAt: input.scheduledPickupAt,
      note: input.note,
    });
  }

  /** Vendor-initiated round trip: creates the collect leg now; the delivery leg is
   *  created later via markReadyToDeliver once the vendor has washed off-app. */
  async createRoundTrip(requesterUserId: string, input: CreateLogisticsInput) {
    return this.createCollect(requesterUserId, { ...input, roundTrip: true });
  }

  /**
   * Round-trip: once the vendor has finished washing (off-app) they mark the collect
   * leg ready; this spawns the delivery leg (vendor → the same recipient) as a draft
   * to be paid and run.
   */
  async markReadyToDeliver(collectOrderId: string, requesterUserId: string) {
    const collect = await this.ordersService.findOne(collectOrderId);
    if (collect.customerId !== requesterUserId) throw new ForbiddenException('Access denied');
    if (collect.flow !== 'logistics_collect') throw new BadRequestException('Not a collect leg');
    if (!(collect.pricingSnapshot as any)?.roundTrip) throw new BadRequestException('This leg is not part of a round trip');
    if (!collect.recipient) throw new BadRequestException('Collect leg has no recipient on record');
    const existing = await this.orderRepo.findOne({ where: { parentOrderId: collect.id } });
    if (existing) return this.present(existing);

    const vendor = await this.requireLocatedVendor(collect.vendorId!);
    await this.orderRepo.update(collect.id, { readyToDeliverAt: new Date() });

    return this.createLeg({
      flow: 'logistics_delivery',
      requesterType: 'vendor',
      ownerUserId: requesterUserId,
      vendor,
      from: { latitude: vendor.latitude!, longitude: vendor.longitude! },
      fromAddress: vendor.businessName ?? 'Vendor shop',
      to: { latitude: collect.recipient.latitude, longitude: collect.recipient.longitude },
      recipient: collect.recipient,
      parentOrderId: collect.id,
    });
  }

  // ─── Payment (reuses existing rails) ─────────────────────────────────────────

  /** Customer pays from their WashPoints wallet (customer-initiated flow). */
  async payFromWallet(orderId: string, customerUserId: string) {
    return this.ordersService.confirmPayment(orderId, customerUserId);
  }

  /** Create a card payment link for a logistics leg (vendor pays, or a recipient link). */
  async createPaymentLink(orderId: string, requesterUserId: string, purpose: 'self' | 'sponsor') {
    return this.orderFundingService.createLink(orderId, requesterUserId, { purpose });
  }

  // ─── Rep leg lifecycle (API-driven; mobile/admin) ────────────────────────────

  async repPickedUp(orderId: string, repUserId: string) {
    const order = await this.loadLeg(orderId);
    await this.assertRep(order, repUserId);
    if (order.status !== OrderStatus.SCHEDULED) {
      throw new BadRequestException('Leg must be scheduled before pickup');
    }
    return this.setStatus(order, OrderStatus.PICKED_UP, repUserId, 'Picked up at origin');
  }

  async repDelivered(orderId: string, repUserId: string) {
    const order = await this.loadLeg(orderId);
    await this.assertRep(order, repUserId);
    if (order.status !== OrderStatus.PICKED_UP) {
      throw new BadRequestException('Leg must be picked up before delivery');
    }
    await this.setStatus(order, OrderStatus.DELIVERED, repUserId, 'Delivered at destination');
    // Settlement (rep transport + platform mobility fee) runs via the logistics branch.
    return this.ordersService.completeOrder(order.id, repUserId, 'admin');
  }

  // ─── Public tracking (recipient) ─────────────────────────────────────────────

  async trackByToken(token: string) {
    const order = await this.orderRepo.findOne({ where: { trackingToken: token } });
    if (!order || !isLogisticsFlow(order.flow)) throw new NotFoundException('Tracking link not found');
    return {
      reference: order.reference,
      flow: order.flow,
      status: order.status,
      recipientName: order.recipient?.name ?? null,
      scheduledPickupAt: order.scheduledPickupAt,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private async createLeg(p: {
    flow: OrderFlow;
    requesterType: 'customer' | 'vendor';
    ownerUserId: string;
    vendor: Vendor;
    from: Coord;
    fromAddress: string;
    to: Coord;
    recipient: LogisticsRecipient | null;
    customerAddress?: string;
    scheduledPickupAt?: string;
    note?: string;
    roundTrip?: boolean;
    parentOrderId?: string;
  }) {
    // Area is derived from the pickup (A) point so the rep broadcast targets the right area.
    const resolution = await this.areasService.resolveAreaForPoint(p.from.latitude, p.from.longitude, {
      source: 'order_placed',
    });
    const areaId = resolution?.area.id;
    if (!areaId) throw new BadRequestException('Could not determine a service area for the pickup point');

    // The requester (vendor user or customer) is the order owner and payer; ensure
    // their WashPoints wallet exists so both the wallet and card payment paths work.
    await this.walletsService.getOrCreateWallet(p.ownerUserId);

    const [rate, cfg, leg] = await Promise.all([
      this.pricingService.getActiveConversionRate(),
      this.platformConfigService.getConfig(),
      this.transportService.legFee(
        { lat: p.from.latitude, lng: p.from.longitude },
        { lat: p.to.latitude, lng: p.to.longitude },
      ),
    ]);

    const transportWp = leg.transportWp;
    const mobilityFeeWp = Math.round(
      Number(cfg.logisticsMobilityFeeWp ?? 0) + (transportWp * Number(cfg.logisticsMobilityFeePercent ?? 0)) / 100,
    );
    const totalWP = transportWp + mobilityFeeWp;
    const nairaEquivalent = rate.pointsPerUnit > 0 ? Math.round(totalWP / rate.pointsPerUnit) : 0;

    const pricing = {
      logistics: true,
      flow: p.flow,
      transportWp,
      mobilityFeeWp,
      distanceKm: leg.distanceKm,
      roundTrip: !!p.roundTrip,
      from: p.fromAddress,
      to: p.recipient?.address ?? p.customerAddress ?? 'Destination',
    };

    const ref = this.generateReference();
    const order = await this.dataSource.transaction(async (manager) => {
      const o = manager.create(Order, {
        reference:                ref,
        customerId:               p.ownerUserId,
        companyId:                null,
        repId:                    null,
        vendorId:                 p.vendor.id,
        requesterType:            p.requesterType,
        allocationMode:           'automatic',
        chosenVendorId:           null,
        areaId,
        areaLocationId:           resolution?.covered ? resolution.location.id : null,
        coverageMatched:          !!resolution?.covered,
        flow:                     p.flow,
        bagId:                    null,
        itemSelections:           null,
        bundleId:                 null,
        serviceType:              'wash_fold', // filler — logistics has no washing service
        bagSize:                  null,
        specialItems:             [],
        ironingCount:             0,
        pickupAddress:            p.fromAddress,
        pickupLatitude:           p.from.latitude,
        pickupLongitude:          p.from.longitude,
        dropoffLatitude:          p.to.latitude,
        dropoffLongitude:         p.to.longitude,
        recipient:                p.recipient,
        scheduledPickupAt:        p.scheduledPickupAt ? new Date(p.scheduledPickupAt) : new Date(),
        deliveryDeadline:         null,
        specialInstructions:      p.note ?? null,
        pricingSnapshot:          pricing as any,
        totalWP,
        nairaEquivalentSnapshot:  nairaEquivalent,
        conversionRateSnapshot:   rate.pointsPerUnit,
        conversionRateId:         rate.id,
        vendorShareWP:            null,
        vendorShareNairaSnapshot: null,
        repShareWP:               null,
        platformShareWP:          null,
        transportEstimateWp:      transportWp,
        mobilityFeeWp,
        parentOrderId:            p.parentOrderId ?? null,
        trackingToken:            this.token(),
        garmentLog:               null,
        status:                   OrderStatus.PENDING_PAYMENT,
        autoCompleteAt:           null,
      });
      await manager.save(o);
      await manager.save(manager.create(OrderStatusHistory, {
        orderId:         o.id,
        fromStatus:      null,
        toStatus:        OrderStatus.PENDING_PAYMENT,
        triggeredBy:     p.ownerUserId,
        triggeredByRole: p.requesterType === 'vendor' ? 'vendor' : 'customer',
        note:            'Logistics leg created — awaiting payment',
      }));
      return o;
    });

    this.logger.log(`Logistics leg created: ${ref} (${p.flow}) ₦${nairaEquivalent} / ${totalWP} WP`);
    return this.present(order);
  }

  private present(order: Order) {
    return {
      id: order.id,
      reference: order.reference,
      flow: order.flow,
      requesterType: order.requesterType,
      status: order.status,
      vendorId: order.vendorId,
      recipient: order.recipient,
      transportWp: order.transportEstimateWp,
      mobilityFeeWp: order.mobilityFeeWp,
      totalWP: order.totalWP,
      nairaEquivalent: order.nairaEquivalentSnapshot,
      trackingToken: order.trackingToken,
      parentOrderId: order.parentOrderId,
      scheduledPickupAt: order.scheduledPickupAt,
    };
  }

  private async loadLeg(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || !isLogisticsFlow(order.flow)) throw new NotFoundException('Logistics leg not found');
    return order;
  }

  private async assertRep(order: Order, repUserId: string) {
    if (!order.repId) throw new BadRequestException('No rep assigned to this leg');
    // repId is the rep profile id; the rep endpoints resolve the caller to their rep
    // profile before calling, so we compare against that here.
    if (order.repId !== repUserId) throw new ForbiddenException('You are not assigned to this leg');
  }

  private async setStatus(order: Order, to: OrderStatus, repId: string, note: string) {
    const from = order.status;
    order.status = to;
    await this.orderRepo.save(order);
    await this.orderRepo.manager.save(
      this.orderRepo.manager.create(OrderStatusHistory, {
        orderId: order.id, fromStatus: from, toStatus: to,
        triggeredBy: repId, triggeredByRole: 'rep', note,
      }),
    );
    return order;
  }

  private requireRecipient(r?: LogisticsRecipient): LogisticsRecipient {
    if (!r || !r.name || !r.phone || !r.address || r.latitude == null || r.longitude == null) {
      throw new BadRequestException('Recipient name, phone, address and coordinates are required');
    }
    return r;
  }

  private async requireLocatedVendor(vendorId: string): Promise<Vendor> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId } });
    if (!vendor) throw new BadRequestException('Vendor not found');
    if (vendor.verificationStatus !== VendorVerificationStatus.VERIFIED) {
      throw new BadRequestException('Vendor is not available');
    }
    if (vendor.latitude == null || vendor.longitude == null) {
      throw new BadRequestException('Vendor has no saved shop location');
    }
    return vendor;
  }

  private async requireLocatedVendorOwnedBy(vendorId: string, userId: string): Promise<Vendor> {
    const vendor = await this.requireLocatedVendor(vendorId);
    if (vendor.userId !== userId) throw new ForbiddenException('You can only create logistics for your own vendor account');
    return vendor;
  }

  private generateReference(): string {
    return `WM-LOG-${Date.now().toString(36).toUpperCase().slice(-6)}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`;
  }

  private token(): string {
    return randomBytes(24).toString('base64url');
  }
}
