import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * Append-only platform price list.
 *
 * Two kinds of prices:
 *  1. Bag prices — priceType: 'bag', serviceType + bagSize determine the key.
 *  2. Special item prices — priceType: 'special_item', itemType is the key.
 *  3. Ironing unit price — priceType: 'ironing' (per garment).
 *
 * Active price query (per type):
 *   WHERE price_type = ? AND service_type = ? AND bag_size = ?
 *   AND effective_from <= NOW() AND approved_at IS NOT NULL
 *   ORDER BY effective_from DESC LIMIT 1
 *
 * Rows are NEVER updated or deleted.
 */
@Entity('platform_price_list')
export class PlatformPriceList {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Type of price entry',
    enum: ['bag', 'special_item', 'ironing'],
    example: 'bag',
  })
  @Column({ name: 'price_type', type: 'varchar', length: 30 })
  priceType: 'bag' | 'special_item' | 'ironing';

  @ApiProperty({
    description: 'Service type — relevant for bag prices',
    enum: ['wash_fold', 'wash_iron'],
    nullable: true,
    example: 'wash_fold',
  })
  @Column({ name: 'service_type', type: 'varchar', length: 30, nullable: true })
  serviceType: 'wash_fold' | 'wash_iron' | null;

  @ApiProperty({
    description: 'Bag size — relevant for bag prices',
    enum: ['small', 'medium', 'large', 'xl'],
    nullable: true,
    example: 'medium',
  })
  @Column({ name: 'bag_size', type: 'varchar', length: 20, nullable: true })
  bagSize: 'small' | 'medium' | 'large' | 'xl' | null;

  @ApiProperty({
    description: 'Item type — relevant for special_item prices (e.g. "suit", "agbada", "duvet")',
    nullable: true,
  })
  @Column({ name: 'item_type', type: 'varchar', length: 100, nullable: true })
  itemType: string | null;

  @ApiProperty({ description: 'Price in WashPoints (always positive integer)' })
  @Column({
    name: 'price_wp',
    type: 'bigint',
    transformer: BigIntTransformer,
  })
  priceWP: number;

  @ApiProperty({ nullable: true, description: 'Admin display label, e.g. "Medium Bag — Wash & Fold"' })
  @Column({ type: 'varchar', length: 200, nullable: true })
  label: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'effective_from', type: 'timestamp with time zone', nullable: true })
  effectiveFrom: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;
}
