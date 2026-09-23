import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { OrderFundingLink } from '../../database/entities/order-funding-link.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { OrdersService } from './orders.service';
import { PaystackService } from '../payments/paystack.service';
import { VaultsService } from '../vaults/vaults.service';
import { UsersService } from '../users/users.service';

/**
 * Order funding — per-order Paystack payment and shareable "sponsor my laundry" links.
 *
 * A draft order (PENDING_PAYMENT) can be funded by:
 *   • the customer, paying with a card via Paystack (purpose 'self'); or
 *   • anyone the customer shares the public link with (purpose 'sponsor').
 *
 * The WashPoints always land in the ORDER OWNER's wallet, and the order is
 * confirmed the instant payment settles (PaystackService → settleFundedTransaction).
 * The naira amount is frozen at link creation using the active vault rate, so the
 * price a sponsor sees can never drift under them.
 */
@Injectable()
export class OrderFundingService {
  private readonly logger = new Logger(OrderFundingService.name);

  /** How long a funding link stays payable. */
  private static readonly LINK_TTL_HOURS = 48;

  constructor(
    @InjectRepository(OrderFundingLink)
    private linkRepo: Repository<OrderFundingLink>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private ordersService: OrdersService,
    @Inject(forwardRef(() => PaystackService))
    private paystackService: PaystackService,
    private vaultsService: VaultsService,
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  private shareUrl(token: string): string {
    const base =
      this.configService.get<string>('app.sponsorLinkBase') ||
      `${this.configService.get<string>('app.landingUrl')}/sponsor`;
    return `${base.replace(/\/$/, '')}/${token}`;
  }

  /**
   * Create (or reuse) a funding link for a draft order. Sizes the naira amount from
   * the active vault rate so the credited WP is guaranteed to cover the order total.
   */
  async createLink(
    orderId: string,
    customerId: string,
    opts: { purpose?: 'self' | 'sponsor' } = {},
  ) {
    const order = await this.ordersService.findOne(orderId);
    if (order.customerId !== customerId) throw new BadRequestException('Access denied');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Only a draft order awaiting payment can be funded by link');
    }

    // Reuse an existing active, unexpired link for this order+purpose.
    const purpose = opts.purpose ?? 'sponsor';
    const existing = await this.linkRepo.findOne({
      where: { orderId, purpose, status: 'active' },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.expiresAt > new Date()) {
      return this.presentLink(existing, order);
    }

    // Size the amount from the active vault rate: kobo such that the credited WP
    // (floor(naira × pointsPerUnit)) is guaranteed ≥ the order total.
    const vault = await this.vaultsService.getActiveDefaultVault();
    const pointsPerUnit = Number(vault.conversionRateSnapshot);
    if (!pointsPerUnit || pointsPerUnit <= 0) {
      throw new BadRequestException('No active conversion rate is configured');
    }
    const amountKobo = Math.ceil((order.totalWP / pointsPerUnit) * 100);

    const link = this.linkRepo.create({
      orderId,
      customerId,
      token: this.generateToken(),
      purpose,
      status: 'active',
      amountKobo,
      washPointsTarget: order.totalWP,
      conversionRateSnapshot: pointsPerUnit,
      conversionRateId: vault.conversionRateId,
      vaultId: vault.id,
      expiresAt: new Date(Date.now() + OrderFundingService.LINK_TTL_HOURS * 3600_000),
      paidAt: null,
      paidReference: null,
      sponsorName: null,
      sponsorMessage: null,
    });
    await this.linkRepo.save(link);
    this.logger.log(`Funding link created: order=${orderId} purpose=${purpose} ₦${amountKobo / 100}`);
    return this.presentLink(link, order);
  }

  private presentLink(link: OrderFundingLink, order: Order) {
    return {
      token:       link.token,
      shareUrl:    this.shareUrl(link.token),
      purpose:     link.purpose,
      status:      link.status,
      amountNaira: link.amountKobo / 100,
      washPoints:  link.washPointsTarget,
      expiresAt:   link.expiresAt,
      orderRef:    order.reference,
    };
  }

  /** Public, unauthenticated view of a funding link for the sponsor page. */
  async getPublicView(token: string) {
    const link = await this.linkRepo.findOne({ where: { token } });
    if (!link) throw new NotFoundException('Funding link not found');
    const order = await this.orderRepo.findOne({ where: { id: link.orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const status = this.effectiveStatus(link, order);

    // Minimal, non-sensitive summary — this page is public. Only a first name is
    // exposed, never the full name / contact details.
    const customer = await this.usersService.getUserById(link.customerId).catch(() => null);
    const fullName = (customer?.data as { fullName?: string } | undefined)?.fullName ?? '';
    const firstName = fullName.trim().split(/\s+/)[0] || 'a Washermann customer';

    return {
      token:          link.token,
      status,
      purpose:        link.purpose,
      amountNaira:    link.amountKobo / 100,
      washPoints:     link.washPointsTarget,
      expiresAt:      link.expiresAt,
      customerName:   firstName,
      orderRef:       order.reference,
      itemCount:      Array.isArray(order.itemSelections) ? order.itemSelections.reduce((s, i) => s + (i.qty ?? 0), 0) : null,
      flow:           order.flow,
      scheduledPickupAt: order.scheduledPickupAt,
    };
  }

  /** Initiate a Paystack payment for a funding link (public — anyone with the link). */
  async pay(token: string, dto: { email: string; name?: string; message?: string }) {
    const link = await this.linkRepo.findOne({ where: { token } });
    if (!link) throw new NotFoundException('Funding link not found');
    const order = await this.orderRepo.findOne({ where: { id: link.orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const status = this.effectiveStatus(link, order);
    if (status === 'paid')      throw new BadRequestException('This order has already been paid');
    if (status === 'expired')   throw new BadRequestException('This funding link has expired');
    if (status === 'cancelled') throw new BadRequestException('This funding link is no longer active');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('This order is no longer awaiting payment');
    }

    // Capture the sponsor's name/message for the record (best-effort).
    if (dto.name || dto.message) {
      link.sponsorName = dto.name ?? link.sponsorName;
      link.sponsorMessage = dto.message ?? link.sponsorMessage;
      await this.linkRepo.save(link);
    }

    const { reference, authorizationUrl, accessCode } = await this.paystackService.initiateOrderFunding({
      orderId:                link.orderId,
      customerId:             link.customerId,
      fundingLinkId:          link.id,
      amountKobo:             link.amountKobo,
      conversionRateId:       link.conversionRateId,
      conversionRateSnapshot: link.conversionRateSnapshot,
      vaultId:                link.vaultId,
      payerEmail:             dto.email,
      sponsorName:            dto.name ?? null,
    });

    return {
      reference,
      authorizationUrl,
      accessCode,
      amountNaira: link.amountKobo / 100,
    };
  }

  /**
   * Called by PaystackService when a funding payment settles: confirm the order
   * (debits the WP just credited into escrow, starts assignment) and mark the link paid.
   * Idempotent — a second webhook delivery is a no-op.
   */
  async settleFundedTransaction(
    fundingLinkId: string | null,
    orderId: string,
    customerId: string,
    paystackRef: string,
  ): Promise<void> {
    await this.ordersService.confirmPayment(orderId, customerId);

    if (fundingLinkId) {
      const link = await this.linkRepo.findOne({ where: { id: fundingLinkId } });
      if (link && link.status === 'active') {
        link.status = 'paid';
        link.paidAt = new Date();
        link.paidReference = paystackRef;
        await this.linkRepo.save(link);
      }
    }
    this.logger.log(`Order funding settled: order=${orderId} ref=${paystackRef}`);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────────

  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private effectiveStatus(link: OrderFundingLink, order: Order): OrderFundingLink['status'] {
    if (link.status !== 'active') return link.status;
    if (order.status === OrderStatus.PAID) return 'paid';
    if (order.status !== OrderStatus.PENDING_PAYMENT) return 'cancelled';
    if (link.expiresAt <= new Date()) return 'expired';
    return 'active';
  }
}
