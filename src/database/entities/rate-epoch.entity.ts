import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';
import { RateWeights, RateBaselines } from './rate-config.entity';

export type RateEpochStatus = 'proposed' | 'approved' | 'rejected';
export type RateEpochTrigger = 'scheduled' | 'manual';
export interface RateFactors { fx: number; diesel: number; vendor: number }
export interface RateInputs { fx: number; diesel: number; vendor: number }

/**
 * Immutable record of one rate calculation. Written on EVERY compute (whether
 * later approved or rejected) so the rate is fully reconstructable and auditable.
 * Only `status`/`decidedBy`/`decidedAt`/`note`/`appliedConversionRateId` change
 * once on the proposed→approved|rejected decision; the computed values never do.
 */
@Entity('rate_epochs')
@Index(['status'])
export class RateEpoch extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'formula_version', type: 'int' })
  formulaVersion: number;

  @ApiProperty({ enum: ['scheduled', 'manual'] })
  @Column({ type: 'varchar', length: 12 })
  trigger: RateEpochTrigger;

  @ApiProperty({ description: 'Admin-supplied current economic indicators' })
  @Column({ type: 'jsonb' })
  inputs: RateInputs;

  @ApiProperty()
  @Column({ type: 'jsonb' })
  baselines: RateBaselines;

  @ApiProperty()
  @Column({ type: 'jsonb' })
  weights: RateWeights;

  @ApiProperty({ description: 'input_i / baseline_i' })
  @Column({ type: 'jsonb' })
  factors: RateFactors;

  @ApiProperty({ description: 'Weighted geometric blend of factors' })
  @Column({ name: 'cost_index', type: 'decimal', precision: 18, scale: 8, transformer: DecimalTransformer })
  costIndex: number;

  @ApiProperty()
  @Column({ name: 'prev_smoothed_index', type: 'decimal', precision: 18, scale: 8, transformer: DecimalTransformer })
  prevSmoothedIndex: number;

  @ApiProperty({ description: 'EMA( costIndex )' })
  @Column({ name: 'smoothed_index', type: 'decimal', precision: 18, scale: 8, transformer: DecimalTransformer })
  smoothedIndex: number;

  @ApiProperty()
  @Column({ name: 'v_base', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  vBase: number;

  @ApiProperty({ description: 'V before this epoch (current live V)' })
  @Column({ name: 'prev_v', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  prevV: number;

  @ApiProperty({ description: 'V_base × smoothedIndex (before cap/deadband)' })
  @Column({ name: 'target_v', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  targetV: number;

  @ApiProperty({ description: 'targetV clamped to ±cap of prevV' })
  @Column({ name: 'v_capped', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  vCapped: number;

  @ApiProperty({ description: 'After deadband (held to prevV if move was trivial)' })
  @Column({ name: 'v_new', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  vNew: number;

  @ApiProperty({ description: 'Discretised, published V' })
  @Column({ name: 'v_published', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  vPublished: number;

  @ApiProperty()
  @Column({ name: 'cap_applied', type: 'boolean' })
  capApplied: boolean;

  @ApiProperty()
  @Column({ name: 'deadband_held', type: 'boolean' })
  deadbandHeld: boolean;

  @ApiProperty()
  @Column({ name: 'buy_spread', type: 'decimal', precision: 8, scale: 4, transformer: DecimalTransformer })
  buySpread: number;

  @ApiProperty()
  @Column({ name: 'payout_spread', type: 'decimal', precision: 8, scale: 4, transformer: DecimalTransformer })
  payoutSpread: number;

  @ApiProperty({ description: 'WP per ₦1 for the buy leg = 1/(V×(1+buySpread))' })
  @Column({ name: 'points_per_unit', type: 'decimal', precision: 12, scale: 6, transformer: DecimalTransformer })
  pointsPerUnit: number;

  @ApiProperty({ description: '₦ per WP for the payout leg = V×(1−payoutSpread)' })
  @Column({ name: 'payout_rate', type: 'decimal', precision: 12, scale: 4, transformer: DecimalTransformer })
  payoutRate: number;

  @ApiProperty({ enum: ['proposed', 'approved', 'rejected'] })
  @Column({ type: 'varchar', length: 12, default: 'proposed' })
  status: RateEpochStatus;

  @ApiProperty({ nullable: true })
  @Column({ name: 'proposed_by', type: 'uuid', nullable: true })
  proposedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'decided_at', type: 'timestamp with time zone', nullable: true })
  decidedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @ApiProperty({ nullable: true, description: 'conversion_rates row written on approval (if V changed)' })
  @Column({ name: 'applied_conversion_rate_id', type: 'uuid', nullable: true })
  appliedConversionRateId: string | null;

  @ApiProperty({ description: 'SHA-256 over the canonical computed content' })
  @Column({ type: 'varchar', length: 64 })
  hash: string;
}
