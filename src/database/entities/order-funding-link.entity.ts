import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * A shareable link that funds a specific draft order (PENDING_PAYMENT).
 *
 * Two purposes, one mechanism:
 *   • 'self'    — the customer pays for their own order via a Paystack link
 *                 (an alternative to paying from their WashPoints wallet).
 *   • 'sponsor' — the customer shares a public link so a friend can pay for
 *                 their laundry ("sponsor your laundry").
 *
 * Either way the WashPoints are credited to the ORDER OWNER's wallet and the
 * order is immediately confirmed (see OrdersService.confirmPayment). The amount
 * is snapshotted at link creation using the active vault rate, so the price a
 * sponsor sees never drifts. One-time: once paid, the link is spent.
 */
@Entity('order_funding_links')
export class OrderFundingLink extends BaseEntity {
  @ApiProperty()
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ApiProperty({ description: 'Order owner — WP are credited here on payment' })
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ApiProperty({ description: 'Public, URL-safe token used in the shareable link' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, unique: true })
  token: string;

  @ApiProperty({ enum: ['self', 'sponsor'] })
  @Column({ type: 'varchar', length: 12, default: 'sponsor' })
  purpose: 'self' | 'sponsor';

  @ApiProperty({ enum: ['active', 'paid', 'expired', 'cancelled'] })
  @Column({ type: 'varchar', length: 12, default: 'active' })
  status: 'active' | 'paid' | 'expired' | 'cancelled';

  @ApiProperty({ description: 'Amount to charge (kobo), snapshotted at creation' })
  @Column({ name: 'amount_kobo', type: 'bigint', transformer: BigIntTransformer })
  amountKobo: number;

  @ApiProperty({ description: 'WashPoints this payment must deliver (= order.totalWP)' })
  @Column({ name: 'wash_points_target', type: 'bigint', transformer: BigIntTransformer })
  washPointsTarget: number;

  @ApiProperty({ nullable: true, description: 'Vault WP/₦ rate used to size the amount' })
  @Column({ name: 'conversion_rate_snapshot', type: 'decimal', precision: 18, scale: 6, nullable: true })
  conversionRateSnapshot: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'vault_id', type: 'uuid', nullable: true })
  vaultId: string | null;

  @ApiProperty({ description: 'Link expiry — payment refused after this instant' })
  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expiresAt: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'paid_at', type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Paystack reference that settled this link' })
  @Column({ name: 'paid_reference', type: 'varchar', length: 100, nullable: true })
  paidReference: string | null;

  @ApiProperty({ nullable: true, description: 'Name the sponsor gave (public form)' })
  @Column({ name: 'sponsor_name', type: 'varchar', length: 160, nullable: true })
  sponsorName: string | null;

  @ApiProperty({ nullable: true, description: 'Optional message from the sponsor' })
  @Column({ name: 'sponsor_message', type: 'varchar', length: 500, nullable: true })
  sponsorMessage: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { eager: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
