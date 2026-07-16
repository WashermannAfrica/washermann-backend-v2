import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';
import { ReferrerType, ReferredType } from './referral-code.entity';

export type ReferralStatus = 'pending' | 'available' | 'paid' | 'rejected';
export type RewardKind = 'fixed' | 'percent';
export type RewardCurrency = 'cash' | 'wp';

/**
 * A referred signup and its reward lifecycle (split-leg):
 *   register -> pending -> (customer: 1st completed order | vendor: approval) -> available -> paid
 * The reward rule in force at creation is snapshotted so later config changes
 * never alter an earned reward.
 */
@Entity('referrals')
@Index(['referredUserId'])
@Index(['referrerUserId'])
@Index(['status'])
export class Referral extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'varchar', length: 24 })
  code: string;

  @ApiProperty()
  @Column({ name: 'referrer_user_id', type: 'uuid' })
  referrerUserId: string;

  @ApiProperty({ enum: ['sales_rep', 'rep', 'customer', 'vendor'] })
  @Column({ name: 'referrer_type', type: 'varchar', length: 20 })
  referrerType: ReferrerType;

  @ApiProperty()
  @Column({ name: 'referred_user_id', type: 'uuid' })
  referredUserId: string;

  @ApiProperty({ enum: ['customer', 'vendor'], description: 'Whether the referred signup is a customer or a vendor' })
  @Column({ name: 'referred_type', type: 'varchar', length: 20 })
  referredType: ReferredType;

  @ApiProperty({ enum: ['pending', 'available', 'paid', 'rejected'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ReferralStatus;

  // ─── Snapshotted reward (frozen at creation) ──────────────────────────────────
  @ApiProperty({ enum: ['fixed', 'percent'], nullable: true })
  @Column({ name: 'reward_kind', type: 'varchar', length: 10, nullable: true })
  rewardKind: RewardKind | null;

  @ApiProperty({ nullable: true, description: 'Rule value at creation: fixed amount, or % of first order' })
  @Column({ name: 'reward_value', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  rewardValue: number | null;

  @ApiProperty({ enum: ['cash', 'wp'], description: 'cash for agents (sales/wash rep), wp for users (customer/vendor)' })
  @Column({ name: 'reward_currency', type: 'varchar', length: 10 })
  rewardCurrency: RewardCurrency;

  @ApiProperty({ nullable: true, description: 'Computed reward amount once unlockable (₦ for cash, WP for wp)' })
  @Column({ name: 'reward_amount', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  rewardAmount: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'unlocked_at', type: 'timestamp with time zone', nullable: true })
  unlockedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'paid_at', type: 'timestamp with time zone', nullable: true })
  paidAt: Date | null;

  // ─── Admin oversight / audit ──────────────────────────────────────────────────
  @ApiProperty({ nullable: true, description: 'Admin note on a flag/reject/adjust action' })
  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @ApiProperty({ nullable: true, description: 'Admin user id that last flagged/adjusted this referral' })
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;
}
