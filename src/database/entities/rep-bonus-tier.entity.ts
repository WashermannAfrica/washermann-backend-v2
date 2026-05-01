import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Admin-editable bonus tier table.
 *
 * Each row defines a rating band and the corresponding bonus percentage applied
 * to a rep's cycle WashPoints earnings.
 *
 * The full set of tiers must be non-overlapping and cover all possible rating values.
 * Default configuration (from plan):
 *   4.8–5.0 → +15%
 *   4.5–4.7 → +10%
 *   4.0–4.4 → +5%
 *   3.5–3.9 → 0%
 *   0.0–3.4 → 0% + flagged
 *
 * flagReview: whether reps in this tier should be auto-flagged.
 */
@Entity('rep_bonus_tiers')
export class RepBonusTier extends BaseEntity {
  @ApiProperty({ description: 'Human-readable label, e.g. "Gold"', example: 'Gold' })
  @Column({ type: 'varchar', length: 100 })
  label: string;

  @ApiProperty({ description: 'Minimum rating (inclusive)', example: 4.5 })
  @Column({
    name: 'min_rating',
    type: 'decimal',
    precision: 3,
    scale: 2,
    transformer: DecimalTransformer,
  })
  minRating: number;

  @ApiProperty({ description: 'Maximum rating (inclusive)', example: 4.7 })
  @Column({
    name: 'max_rating',
    type: 'decimal',
    precision: 3,
    scale: 2,
    transformer: DecimalTransformer,
  })
  maxRating: number;

  @ApiProperty({ description: 'Bonus percentage applied to cycle earnings', example: 10 })
  @Column({
    name: 'bonus_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: DecimalTransformer,
  })
  bonusPercent: number;

  @ApiProperty({
    default: false,
    description: 'Whether reps falling in this band should be auto-flagged for review',
  })
  @Column({ name: 'flag_review', type: 'boolean', default: false })
  flagReview: boolean;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
