import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Single-row table (key/value store) for platform-wide configuration.
 *
 * All values here can be updated live by admin with immediate effect.
 * Existing orders are NEVER retroactively affected — snapshots are taken at
 * order creation time.
 *
 * We store as one typed row rather than an EAV pattern to get type safety
 * and migrations on schema changes.
 */
@Entity('platform_config')
export class PlatformConfig {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({
    description: 'Platform price offset percentage applied on top of vendor weighted average',
    example: 25,
  })
  @Column({
    name: 'platform_price_offset_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 25,
    transformer: DecimalTransformer,
  })
  platformPriceOffsetPercent: number;

  @ApiProperty({
    description: 'Rep share of order total as a percentage',
    example: 15,
  })
  @Column({
    name: 'rep_share_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 15,
    transformer: DecimalTransformer,
  })
  repSharePercent: number;

  @ApiProperty({
    description: 'Service charge applied to order subtotal as a percentage',
    example: 5,
  })
  @Column({
    name: 'service_charge_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 5,
    transformer: DecimalTransformer,
  })
  serviceChargePercent: number;

  @ApiProperty({
    description: 'Payout rate: how many Naira per WashPoint (vendor/rep payout direction)',
    example: 9,
  })
  @Column({
    name: 'payout_rate_naira_per_wp',
    type: 'decimal',
    precision: 10,
    scale: 4,
    default: 9,
    transformer: DecimalTransformer,
  })
  payoutRateNairaPerWP: number;

  @ApiProperty({
    description: 'Rating threshold below which a rep is flagged for admin review',
    example: 3.5,
  })
  @Column({
    name: 'low_rating_threshold',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 3.5,
    transformer: DecimalTransformer,
  })
  lowRatingThreshold: number;

  @ApiProperty({
    description: 'Default bonus cycle period',
    enum: ['weekly', 'monthly', 'quarterly'],
    example: 'monthly',
  })
  @Column({
    name: 'bonus_cycle_period',
    type: 'varchar',
    length: 20,
    default: 'monthly',
  })
  bonusCyclePeriod: 'weekly' | 'monthly' | 'quarterly';

  @ApiProperty({
    description: 'Hours before a delivered order is auto-completed if customer does not confirm',
    example: 24,
  })
  @Column({
    name: 'order_auto_complete_hours',
    type: 'int',
    default: 24,
  })
  orderAutoCompleteHours: number;

  @ApiProperty({
    description: 'VAT percentage applied on top of subtotal (0 = disabled)',
    example: 7.5,
  })
  @Column({
    name: 'vat_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: DecimalTransformer,
  })
  vatPercent: number;

  @ApiProperty({
    description: 'Percentile of vendor prices used when suggesting platform prices (0-100). ' +
                 'P70 means the suggestion is above 70% of vendors, protecting margin.',
    example: 70,
  })
  @Column({
    name: 'price_suggestion_percentile',
    type: 'int',
    default: 70,
  })
  priceSuggestionPercentile: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
