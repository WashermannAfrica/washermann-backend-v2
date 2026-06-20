import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { CatalogueCategory } from './catalogue-category.entity';
import { CatalogueSubCategory } from './catalogue-subcategory.entity';
import { DecimalTransformer, BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * The canonical priced unit. Everything (vendor prices, bags, bundles, orders)
 * references an item by id.
 *
 * Price is NOT typed by the admin — it is DERIVED (P70 of active vendor prices +
 * charge stack) and cached here by the daily price-epoch job (later phase).
 * Until at least one active vendor prices the item, priceNgn is null and the
 * item is unavailable.
 */
@Entity('catalogue_items')
@Index(['categoryId'])
export class CatalogueItem extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'subcategory_id', type: 'uuid', nullable: true })
  subCategoryId: string | null;

  @ApiProperty({ example: 'Dress Shirt' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ example: 'dress-shirt' })
  @Column({ type: 'varchar', length: 240, unique: true })
  slug: string;

  @ApiProperty({ nullable: true, description: 'SVG markup or asset URL for the item icon' })
  @Column({ name: 'svg_icon', type: 'text', nullable: true })
  svgIcon: string | null;

  @ApiProperty({ description: 'Eligible for the Wash & Fold bag system' })
  @Column({ name: 'is_everyday', type: 'boolean', default: false })
  isEveryday: boolean;

  @ApiProperty({ description: 'Admin enable/disable' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ description: 'Derived: active AND has a computed price (set by the price-epoch job)' })
  @Column({ name: 'is_available', type: 'boolean', default: false })
  isAvailable: boolean;

  @ApiProperty({ nullable: true, description: 'Cached platform price in Naira (P70 + charges)' })
  @Column({ name: 'price_ngn', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  priceNgn: number | null;

  @ApiProperty({ nullable: true, description: 'Cached platform price in WashPoints' })
  @Column({ name: 'price_wp', type: 'bigint', nullable: true, transformer: BigIntTransformer })
  priceWp: number | null;

  @ApiProperty({ nullable: true, description: 'When the cached price was last computed' })
  @Column({ name: 'price_computed_at', type: 'timestamp with time zone', nullable: true })
  priceComputedAt: Date | null;

  @ApiProperty({ enum: ['seeded', 'admin', 'promoted_from_suggestion'] })
  @Column({ type: 'varchar', length: 30, default: 'admin' })
  source: 'seeded' | 'admin' | 'promoted_from_suggestion';

  @ApiProperty({ nullable: true, description: 'Suggestion this item was promoted from' })
  @Column({ name: 'origin_suggestion_id', type: 'uuid', nullable: true })
  originSuggestionId: string | null;

  @ApiProperty({ description: 'Display order' })
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ManyToOne(() => CatalogueCategory, { eager: false })
  @JoinColumn({ name: 'category_id' })
  category: CatalogueCategory;

  @ManyToOne(() => CatalogueSubCategory, { eager: false })
  @JoinColumn({ name: 'subcategory_id' })
  subCategory: CatalogueSubCategory | null;
}
