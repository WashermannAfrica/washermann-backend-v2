import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Bundle } from './bundle.entity';

export type BundleLineType = 'item' | 'category';

/**
 * One composition line of a bundle.
 *  - 'item'     → a specific catalogue item
 *  - 'category' → expands to all active items in the category (for the P70 calc)
 * Each line carries a quantity; the bundle base price uses the median of the
 * line quantities.
 */
@Entity('bundle_lines')
@Index(['bundleId'])
export class BundleLine extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'bundle_id', type: 'uuid' })
  bundleId: string;

  @ApiProperty({ enum: ['item', 'category'] })
  @Column({ name: 'line_type', type: 'varchar', length: 20 })
  lineType: BundleLineType;

  @ApiProperty({ nullable: true })
  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ApiProperty({ example: 3 })
  @Column({ type: 'int', default: 1 })
  quantity: number;

  @ApiProperty({ description: 'Display order' })
  @Column({ name: 'sort_order', type: 'int', default: 100 })
  sortOrder: number;

  @ManyToOne(() => Bundle, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bundle_id' })
  bundle: Bundle;
}
