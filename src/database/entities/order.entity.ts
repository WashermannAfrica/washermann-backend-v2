import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Rep } from './rep.entity';
import { Vendor } from './vendor.entity';
import { Area } from './area.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { BigIntTransformer, DecimalTransformer } from '../../common/transformers/column.transformers';

/** Bag size options */
export type BagSize = 'small' | 'medium' | 'large' | 'xl';

/** Service type options */
export type ServiceType = 'wash_fold' | 'wash_iron';

/** Order flow (catalogue pricing model) */
export type OrderFlow = 'wash_fold' | 'wash_iron' | 'bundle';

/** A selected catalogue item + quantity (wash_iron flow) */
export interface OrderItemSelection {
  itemId: string;
  qty:    number;
}

/** A single special item in the order */
export interface SpecialItem {
  type: string;  // e.g. 'suit', 'agbada', 'duvet'
  qty: number;
}

/** A single line item from the PricingEngine output */
export interface PricingLineItem {
  label: string;
  category: 'bag' | 'special_item' | 'ironing' | 'service_charge' | 'transport';
  unitPriceWP: number | null;
  qty: number | null;
  subtotalWP: number;
}

/** Full PricingEngine output snapshot — stored on the order at placement */
export interface PricingSnapshot {
  lineItems: PricingLineItem[];
  subtotalWP: number;
  serviceChargeWP: number;
  transportWP: number;
  totalWP: number;
  nairaEquivalent: number;
  conversionRateId: string;
  conversionRateSnapshot: number;
  calculatedAt: string;
}

/** Garment count logged by rep at pickup */
export interface GarmentLog {
  [garmentType: string]: number;  // e.g. { shirt: 15, trouser: 8, dress: 4 }
}

/**
 * Core order record.
 *
 * The order is the financial heartbeat of Phase 6:
 *  - All WP values are locked at placement (pricingSnapshot).
 *  - vendorShareWP is calculated + locked at pickup (when rep logs garment count).
 *  - Escrow is released on completion.
 */
@Entity('orders')
export class Order extends BaseEntity {
  @ApiProperty({ example: 'WM-ORD-20260501-000001' })
  @Column({ name: 'reference', type: 'varchar', length: 50, unique: true })
  reference: string;

  @ApiProperty()
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ApiProperty({ nullable: true, description: 'Set when WP comes from a company benefit' })
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'rep_id', type: 'uuid', nullable: true })
  repId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @ApiProperty()
  @Column({ name: 'area_id', type: 'uuid' })
  areaId: string;

  // ─── Service details ─────────────────────────────────────────────────────────

  @ApiProperty({ enum: ['wash_fold', 'wash_iron', 'bundle'], description: 'Order flow (catalogue model)' })
  @Column({ name: 'flow', type: 'varchar', length: 20, nullable: true })
  flow: OrderFlow | null;

  @ApiProperty({ nullable: true, description: 'Bag bought (wash_fold flow)' })
  @Column({ name: 'bag_id', type: 'uuid', nullable: true })
  bagId: string | null;

  @ApiProperty({ nullable: true, type: 'array', description: 'Selected catalogue items + qty (wash_iron flow)' })
  @Column({ name: 'item_selections', type: 'jsonb', nullable: true })
  itemSelections: OrderItemSelection[] | null;

  @ApiProperty({ nullable: true, description: 'Bundle bought (bundle flow)' })
  @Column({ name: 'bundle_id', type: 'uuid', nullable: true })
  bundleId: string | null;

  @ApiProperty({ enum: ['wash_fold', 'wash_iron'] })
  @Column({ name: 'service_type', type: 'varchar', length: 20 })
  serviceType: ServiceType;

  @ApiProperty({ enum: ['small', 'medium', 'large', 'xl'], nullable: true, description: 'Legacy bag size (pre-catalogue)' })
  @Column({ name: 'bag_size', type: 'varchar', length: 10, nullable: true })
  bagSize: BagSize | null;

  @ApiProperty({ type: 'array', description: 'Special items outside the bag (legacy)' })
  @Column({ name: 'special_items', type: 'jsonb', default: '[]' })
  specialItems: SpecialItem[];

  @ApiProperty({ description: 'Number of garments to iron (0 if wash_fold)' })
  @Column({ name: 'ironing_count', type: 'int', default: 0 })
  ironingCount: number;

  // ─── Pickup / schedule ───────────────────────────────────────────────────────

  @ApiProperty()
  @Column({ name: 'pickup_address', type: 'varchar', length: 1000 })
  pickupAddress: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'pickup_latitude', type: 'float', nullable: true })
  pickupLatitude: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'pickup_longitude', type: 'float', nullable: true })
  pickupLongitude: number | null;

  @ApiProperty()
  @Column({ name: 'scheduled_pickup_at', type: 'timestamp with time zone' })
  scheduledPickupAt: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'special_instructions', type: 'varchar', length: 1000, nullable: true })
  specialInstructions: string | null;

  // ─── Pricing (locked at placement) ───────────────────────────────────────────

  @ApiProperty({ description: 'Full PricingEngine output, frozen at order placement' })
  @Column({ name: 'pricing_snapshot', type: 'jsonb' })
  pricingSnapshot: PricingSnapshot;

  @ApiProperty({ description: 'Total WashPoints the customer paid' })
  @Column({
    name: 'total_wp',
    type: 'bigint',
    transformer: BigIntTransformer,
  })
  totalWP: number;

  @ApiProperty({ description: 'Naira equivalent snapshotted at placement' })
  @Column({
    name: 'naira_equivalent_snapshot',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: DecimalTransformer,
  })
  nairaEquivalentSnapshot: number;

  @ApiProperty({ description: 'Conversion rate (WP/₦) snapshotted at placement' })
  @Column({
    name: 'conversion_rate_snapshot',
    type: 'decimal',
    precision: 10,
    scale: 4,
    transformer: DecimalTransformer,
  })
  conversionRateSnapshot: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  // ─── Earnings split (locked at picked_up status) ─────────────────────────────

  @ApiProperty({ nullable: true, description: 'Vendor share (WP) — locked when rep logs garment count' })
  @Column({
    name: 'vendor_share_wp',
    type: 'bigint',
    nullable: true,
    transformer: BigIntTransformer,
  })
  vendorShareWP: number | null;

  @ApiProperty({ nullable: true })
  @Column({
    name: 'vendor_share_naira_snapshot',
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: DecimalTransformer,
  })
  vendorShareNairaSnapshot: number | null;

  @ApiProperty({ nullable: true, description: 'Rep share (WP)' })
  @Column({
    name: 'rep_share_wp',
    type: 'bigint',
    nullable: true,
    transformer: BigIntTransformer,
  })
  repShareWP: number | null;

  @ApiProperty({ nullable: true, description: 'Platform revenue (WP)' })
  @Column({
    name: 'platform_share_wp',
    type: 'bigint',
    nullable: true,
    transformer: BigIntTransformer,
  })
  platformShareWP: number | null;

  @ApiProperty({ nullable: true, description: 'Garment count logged by rep at pickup' })
  @Column({ name: 'garment_log', type: 'jsonb', nullable: true })
  garmentLog: GarmentLog | null;

  // ─── Status ──────────────────────────────────────────────────────────────────

  @ApiProperty({ enum: OrderStatus })
  @Column({
    type: 'varchar',
    length: 40,
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @ApiProperty({ nullable: true })
  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'cancellation_reason', type: 'varchar', length: 1000, nullable: true })
  cancellationReason: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Timestamp after which auto-complete fires' })
  @Column({ name: 'auto_complete_at', type: 'timestamp with time zone', nullable: true })
  autoCompleteAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Whether customer has submitted a rating' })
  @Column({ name: 'rated_at', type: 'timestamp with time zone', nullable: true })
  ratedAt: Date | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @ManyToOne(() => Rep, { eager: false, nullable: true })
  @JoinColumn({ name: 'rep_id' })
  rep: Rep | null;

  @ManyToOne(() => Vendor, { eager: false, nullable: true })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor | null;

  @ManyToOne(() => Area, { eager: false })
  @JoinColumn({ name: 'area_id' })
  area: Area;
}
