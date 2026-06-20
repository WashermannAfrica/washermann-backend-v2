import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'merged';

/**
 * Moderation queue for catalogue items proposed outside the seeded catalogue:
 *  - source 'vendor'    — a vendor offered an item we don't have yet (with a price)
 *  - source 'migration' — a legacy free-text garment string pulled in for mapping
 *
 * On approval an admin creates (or merges into) a CatalogueItem; resolvedItemId
 * links the suggestion to the resulting item, and the vendor's pending price line
 * is relinked to it.
 */
@Entity('vendor_item_suggestions')
@Index(['status'])
@Index(['normalizedText'])
export class VendorItemSuggestion extends BaseEntity {
  @ApiProperty({ enum: ['vendor', 'migration'] })
  @Column({ type: 'varchar', length: 20, default: 'vendor' })
  source: 'vendor' | 'migration';

  @ApiProperty({ nullable: true, description: 'Vendor who suggested it (null for migrated strings)' })
  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @ApiProperty({ example: 'Ankara Gown' })
  @Column({ name: 'raw_text', type: 'varchar', length: 300 })
  rawText: string;

  @ApiProperty({ description: 'Lowercased/trimmed for dedup' })
  @Column({ name: 'normalized_text', type: 'varchar', length: 300 })
  normalizedText: string;

  @ApiProperty({ nullable: true, description: 'Price the vendor proposed for this item (₦)' })
  @Column({ name: 'proposed_price_naira', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  proposedPriceNaira: number | null;

  @ApiProperty({ nullable: true, description: "Admin's working category choice during review" })
  @Column({ name: 'suggested_category_id', type: 'uuid', nullable: true })
  suggestedCategoryId: string | null;

  @ApiProperty({ enum: ['pending', 'approved', 'rejected', 'merged'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SuggestionStatus;

  @ApiProperty({ nullable: true, description: 'Catalogue item this resolved to' })
  @Column({ name: 'resolved_item_id', type: 'uuid', nullable: true })
  resolvedItemId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'review_notes', type: 'varchar', length: 1000, nullable: true })
  reviewNotes: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'reviewed_at', type: 'timestamp with time zone', nullable: true })
  reviewedAt: Date | null;
}
