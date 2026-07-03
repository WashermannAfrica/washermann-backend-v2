import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Vendor } from './vendor.entity';

/** Per-item review decision inside a pricing proposal. */
export type PriceItemStatus = 'pending' | 'approved' | 'rejected';

/** A single garment price entry inside VendorPricing.items */
export interface GarmentPriceItem {
  /**
   * Canonical catalogue item this price is for (the P70 join key).
   * Optional during the catalogue transition; new pricing should always set it.
   */
  itemId?: string;
  /** e.g. 'shirt', 'trouser', 'agbada', 'duvet' — legacy free-text, retained until fully migrated */
  garmentType: string;
  /** Price in Naira (stored as number, e.g. 800 = ₦800) */
  priceNaira: number;
  /**
   * Per-item review decision. Absent on legacy proposals approved before per-item
   * review existed — those count as live (see {@link isPriceItemLive}).
   */
  status?: PriceItemStatus;
  /** Admin's reason when this line was rejected. */
  rejectionReason?: string | null;
  /** ISO timestamp of the per-item decision. */
  decidedAt?: string | null;
}

/**
 * A price line is "live" (usable for charging/order math) when it is explicitly
 * approved, OR has no status at all (legacy proposals where the whole proposal
 * was approved before per-item review). Pending/rejected lines are never live.
 */
export function isPriceItemLive(item: GarmentPriceItem): boolean {
  return item.status == null || item.status === 'approved';
}

/** Stable key for matching a price line across requests (catalogue id, else garment type). */
export function priceItemKey(item: GarmentPriceItem): string {
  return item.itemId ?? `gt:${item.garmentType}`;
}

/**
 * Append-only pricing history for each vendor.
 *
 * Rules:
 * - Rows are NEVER updated or deleted.
 * - A new row is inserted every time admin approves a pricing update.
 * - The "active" price list is the latest row WHERE approvedAt IS NOT NULL
 *   AND effectiveFrom <= NOW().
 * - Pending row: approvedAt IS NULL.
 *
 * Cooldown: vendor may only propose an update every N days (ENV: VENDOR_PRICING_COOLDOWN_DAYS).
 */
@Entity('vendor_pricing')
export class VendorPricing {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @ApiProperty({
    description: 'Array of { garmentType, priceNaira } objects',
    type: 'array',
  })
  @Column({ type: 'jsonb' })
  items: GarmentPriceItem[];

  @ApiProperty({ description: 'When this pricing becomes effective (set by admin on approval)' })
  @Column({ name: 'effective_from', type: 'timestamp with time zone', nullable: true })
  effectiveFrom: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'proposed_at', type: 'timestamp with time zone' })
  proposedAt: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'FK → admin User who approved' })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ApiProperty({ nullable: true, description: 'Reason if admin rejected this pricing' })
  @Column({ name: 'rejection_reason', type: 'varchar', length: 1000, nullable: true })
  rejectionReason: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'rejected_at', type: 'timestamp with time zone', nullable: true })
  rejectedAt: Date | null;

  // ─── Rate lock (drift Option 2) ────────────────────────────────────────────────
  // The WP/₦ conversion rate is SNAPSHOTTED when the admin finalizes this sheet.
  // All earnings minted under this sheet AND their payout burn use this locked
  // rate, so the vendor's ₦-in equals ₦-out regardless of platform rate moves.

  @ApiProperty({ nullable: true, description: 'ConversionRate row locked at approval' })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  @ApiProperty({ nullable: true, description: 'WP per ₦1, locked at approval' })
  @Column({
    name: 'points_per_unit_snapshot',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v == null ? null : parseFloat(v)),
    },
  })
  pointsPerUnitSnapshot: number | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Vendor, { eager: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
