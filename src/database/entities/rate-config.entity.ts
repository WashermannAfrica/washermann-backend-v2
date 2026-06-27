import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

export interface RateWeights { fx: number; diesel: number; vendor: number }
export interface RateBaselines { fx: number; diesel: number; vendor: number }

/**
 * Singleton configuration for the WashPoint Monetary Policy engine.
 * V_base and the launch state are the executive-locked anchor (V=₦6.86, every
 * factor = 1 at launch → SmoothedIndex = 1). `currentV` and `lastSmoothedIndex`
 * advance only when an admin APPROVES a rate epoch.
 */
@Entity('rate_config')
export class RateConfig extends BaseEntity {
  @ApiProperty({ description: 'Naira backing of 1 WP at launch (executive-locked anchor)' })
  @Column({ name: 'v_base', type: 'decimal', precision: 12, scale: 4, default: 6.86, transformer: DecimalTransformer })
  vBase: number;

  @ApiProperty({ description: 'Current live V (last approved)' })
  @Column({ name: 'current_v', type: 'decimal', precision: 12, scale: 4, default: 6.86, transformer: DecimalTransformer })
  currentV: number;

  @ApiProperty({ description: 'Smoothed index carried from the last approved epoch (EMA state)' })
  @Column({ name: 'last_smoothed_index', type: 'decimal', precision: 18, scale: 8, default: 1, transformer: DecimalTransformer })
  lastSmoothedIndex: number;

  @ApiProperty({ description: 'EMA smoothing constant (≈90-day response)' })
  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0.2, transformer: DecimalTransformer })
  alpha: number;

  @ApiProperty({ description: 'Max monthly movement of V (percent)' })
  @Column({ name: 'cap_pct', type: 'decimal', precision: 6, scale: 2, default: 5, transformer: DecimalTransformer })
  capPct: number;

  @ApiProperty({ description: 'Deadband: ignore V moves smaller than this (percent)' })
  @Column({ name: 'deadband_pct', type: 'decimal', precision: 6, scale: 2, default: 1, transformer: DecimalTransformer })
  deadbandPct: number;

  @ApiProperty({ description: 'Discretisation grid for published V (Naira)' })
  @Column({ name: 'step_naira', type: 'decimal', precision: 8, scale: 4, default: 0.005, transformer: DecimalTransformer })
  stepNaira: number;

  @ApiProperty({ description: 'Top-up spread on V (buy leg)' })
  @Column({ name: 'buy_spread', type: 'decimal', precision: 8, scale: 4, default: 0, transformer: DecimalTransformer })
  buySpread: number;

  @ApiProperty({ description: 'Payout spread on V (cash-out leg)' })
  @Column({ name: 'payout_spread', type: 'decimal', precision: 8, scale: 4, default: 0, transformer: DecimalTransformer })
  payoutSpread: number;

  @ApiProperty({ description: 'Formula/weights version' })
  @Column({ name: 'formula_version', type: 'int', default: 1 })
  formulaVersion: number;

  @ApiProperty({ description: 'Factor weights (must sum to 1)' })
  @Column({ type: 'jsonb', default: () => `'{"fx":0.4,"diesel":0.2,"vendor":0.4}'` })
  weights: RateWeights;

  @ApiProperty({ description: 'Factor baselines captured at launch (factor=1 when input=baseline)' })
  @Column({ type: 'jsonb', default: () => `'{"fx":1400,"diesel":1300,"vendor":4500}'` })
  baselines: RateBaselines;

  @ApiProperty({ nullable: true, description: 'When admins were last prompted to review V' })
  @Column({ name: 'last_prompted_at', type: 'timestamp with time zone', nullable: true })
  lastPromptedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'When V was last approved' })
  @Column({ name: 'last_approved_at', type: 'timestamp with time zone', nullable: true })
  lastApprovedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;
}
