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

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Vendor, { eager: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
