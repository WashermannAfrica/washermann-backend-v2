import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer, BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * A Wash & Fold bag — the purchasable unit of the wash_fold flow.
 *
 * The customer buys a bag of fixed capacity (no per-item selection). Price is
 * DERIVED and cached:  bagPrice = P70(active everyday item prices) × allowedItemCount.
 * The eligible item/category lists are operational guidance for wash-reps
 * (sorting & reporting), not a pricing input.
 */
@Entity('bags')
export class Bag extends BaseEntity {
  @ApiProperty({ example: 'Medium Bag' })
  @Column({ type: 'varchar', length: 160 })
  name: string;

  @ApiProperty({ example: 'medium-bag' })
  @Column({ type: 'varchar', length: 200, unique: true })
  slug: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @ApiProperty({ description: 'Number of items the bag holds — multiplies the everyday P70 base' })
  @Column({ name: 'allowed_item_count', type: 'int' })
  allowedItemCount: number;

  @ApiProperty({ description: 'Item UUIDs eligible for this bag (operational guidance)', type: [String] })
  @Column({ name: 'eligible_item_ids', type: 'jsonb', default: '[]' })
  eligibleItemIds: string[];

  @ApiProperty({ description: 'Category UUIDs eligible for this bag (operational guidance)', type: [String] })
  @Column({ name: 'eligible_category_ids', type: 'jsonb', default: '[]' })
  eligibleCategoryIds: string[];

  @ApiProperty({ nullable: true, description: 'Cached derived price in Naira' })
  @Column({ name: 'price_ngn', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  priceNgn: number | null;

  @ApiProperty({ nullable: true, description: 'Cached derived price in WashPoints' })
  @Column({ name: 'price_wp', type: 'bigint', nullable: true, transformer: BigIntTransformer })
  priceWp: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'price_computed_at', type: 'timestamp with time zone', nullable: true })
  priceComputedAt: Date | null;

  @ApiProperty({ description: 'Enable/disable' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

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
