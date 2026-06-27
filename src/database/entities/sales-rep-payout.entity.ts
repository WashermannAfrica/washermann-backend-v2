import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

export type SalesRepPayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * A cash payout request from a sales rep. Covers a snapshot set of `available`
 * cash referrals (referralIds); on admin approval those referrals are marked
 * `paid`. A rep may have at most one non-terminal (pending/processing) payout.
 */
@Entity('sales_rep_payouts')
@Index(['salesRepUserId'])
@Index(['status'])
export class SalesRepPayout extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'sales_rep_user_id', type: 'uuid' })
  salesRepUserId: string;

  @ApiProperty({ description: 'Cash amount in Naira' })
  @Column({ name: 'amount_naira', type: 'decimal', precision: 12, scale: 2, transformer: DecimalTransformer })
  amountNaira: number;

  @ApiProperty({ type: [String], description: 'Referral ids covered by this payout' })
  @Column({ name: 'referral_ids', type: 'jsonb' })
  referralIds: string[];

  @ApiProperty({ enum: ['pending', 'processing', 'completed', 'failed'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: SalesRepPayoutStatus;

  @ApiProperty()
  @Column({ name: 'bank_code', type: 'varchar', length: 20 })
  bankCode: string;

  @ApiProperty()
  @Column({ name: 'account_number', type: 'varchar', length: 20 })
  accountNumber: string;

  @ApiProperty()
  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @ApiProperty({ nullable: true, description: 'External transfer reference (e.g. Paystack)' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;
}
