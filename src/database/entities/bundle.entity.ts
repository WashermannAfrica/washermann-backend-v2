import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer, BigIntTransformer } from '../../common/transformers/column.transformers';

export type BundlePromoType = 'percentage' | 'fixed';

/**
 * A standalone purchasable package (alternative to the two flows).
 *
 * Composed of catalogue items and/or categories (a category expands to its
 * active items). Base price is DERIVED:
 *   basePrice = P70(selectable item-type prices) × median(line quantities)
 * Admin may override with a promo (percentage or fixed discount) → isPromo.
 * Optional expiry + audience targeting.
 */
@Entity('bundles')
export class Bundle extends BaseEntity {
  @ApiProperty({ example: 'Family Pack' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ example: 'family-pack' })
  @Column({ type: 'varchar', length: 240, unique: true })
  slug: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'image_url', type: 'varchar', length: 2000, nullable: true })
  imageUrl: string | null;

  @ApiProperty({ description: 'Enable/disable' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Derived base price (P70 × median qty) ────────────────────────────────────
  @ApiProperty({ nullable: true })
  @Column({ name: 'price_ngn', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  priceNgn: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'price_wp', type: 'bigint', nullable: true, transformer: BigIntTransformer })
  priceWp: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'price_computed_at', type: 'timestamp with time zone', nullable: true })
  priceComputedAt: Date | null;

  // ─── Promo override ───────────────────────────────────────────────────────────
  @ApiProperty({ description: 'Whether an admin promo overrides the derived price' })
  @Column({ name: 'is_promo', type: 'boolean', default: false })
  isPromo: boolean;

  @ApiProperty({ enum: ['percentage', 'fixed'], nullable: true })
  @Column({ name: 'promo_type', type: 'varchar', length: 20, nullable: true })
  promoType: BundlePromoType | null;

  @ApiProperty({ nullable: true, description: 'Percent discount (e.g. 10) or fixed price (₦) per promoType' })
  @Column({ name: 'promo_value', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  promoValue: number | null;

  // ─── Effective price (after promo) — what the customer pays ───────────────────
  @ApiProperty({ nullable: true })
  @Column({ name: 'effective_price_ngn', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  effectivePriceNgn: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'effective_price_wp', type: 'bigint', nullable: true, transformer: BigIntTransformer })
  effectivePriceWp: number | null;

  @ApiProperty({ nullable: true, description: 'Optional expiry — bundle not orderable after this' })
  @Column({ name: 'expires_at', type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Audience targeting blob (null = all users)' })
  @Column({ type: 'jsonb', nullable: true })
  audience: Record<string, any> | null;

  @ApiProperty({ description: 'Display order' })
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
