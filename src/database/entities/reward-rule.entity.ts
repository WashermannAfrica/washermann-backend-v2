import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';
import { ReferrerType, ReferredType } from './referral-code.entity';
import { RewardKind } from './referral.entity';

export interface RewardTier { minReferrals: number; kind: RewardKind; value: number; }

/**
 * Admin-configurable reward per (referrerType × referredType) — the CAC lever.
 * Currency is implied by referrerType (cash for sales_rep/rep, wp for customer/vendor).
 */
@Entity('reward_rules')
@Index(['referrerType', 'referredType'], { unique: true })
export class RewardRule extends BaseEntity {
  @ApiProperty({ enum: ['sales_rep', 'rep', 'customer', 'vendor'] })
  @Column({ name: 'referrer_type', type: 'varchar', length: 20 })
  referrerType: ReferrerType;

  @ApiProperty({ enum: ['customer', 'vendor'] })
  @Column({ name: 'referred_type', type: 'varchar', length: 20 })
  referredType: ReferredType;

  @ApiProperty({ enum: ['fixed', 'percent'] })
  @Column({ type: 'varchar', length: 10, default: 'fixed' })
  kind: RewardKind;

  @ApiProperty({ description: 'Fixed amount (₦ or WP by currency), or % of first order' })
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: DecimalTransformer })
  value: number;

  @ApiProperty({ nullable: true, description: 'Optional flat bonus when a referred vendor is approved' })
  @Column({ name: 'vendor_approval_bonus', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  vendorApprovalBonus: number | null;

  @ApiProperty({ nullable: true, description: 'Optional volume tiers' })
  @Column({ type: 'jsonb', nullable: true })
  tiers: RewardTier[] | null;

  @ApiProperty()
  @Column({ type: 'boolean', default: true })
  active: boolean;
}
