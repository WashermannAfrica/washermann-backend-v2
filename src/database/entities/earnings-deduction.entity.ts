import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { BigIntTransformer, DecimalTransformer } from '../../common/transformers/column.transformers';

export type EarningsDeductionStatus = 'pending_response' | 'applied' | 'cancelled';

/**
 * A substantiated claim charge queued against a vendor's earnings (WS4 1.11).
 * The vendor is notified and given a response window (`respondBy`) before the
 * amount is actually debited — either by an admin or by the daily cron once the
 * window lapses. Cancelling before it applies means the vendor is never charged.
 */
@Entity('earnings_deductions')
@Index(['vendorId'])
@Index(['status'])
export class EarningsDeduction extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'dispute_id', type: 'uuid', nullable: true })
  disputeId: string | null;

  @ApiProperty({ description: 'WashPoints to deduct from the vendor earnings wallet' })
  @Column({ name: 'amount_wp', type: 'bigint', transformer: BigIntTransformer })
  amountWp: number;

  @ApiProperty({ nullable: true, description: 'Naira value at creation (display only)' })
  @Column({ name: 'naira_snapshot', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: DecimalTransformer })
  nairaSnapshot: number | null;

  @ApiProperty()
  @Column({ type: 'varchar', length: 1000 })
  reason: string;

  @ApiProperty({ enum: ['pending_response', 'applied', 'cancelled'], default: 'pending_response' })
  @Column({ type: 'varchar', length: 20, default: 'pending_response' })
  status: EarningsDeductionStatus;

  @ApiProperty({ description: 'End of the vendor response window' })
  @Column({ name: 'respond_by', type: 'timestamp with time zone' })
  respondBy: Date;

  @ApiProperty({ nullable: true })
  @Column({ name: 'responded_at', type: 'timestamp with time zone', nullable: true })
  respondedAt: Date | null;

  @ApiProperty({ nullable: true, description: "Vendor's response to the notice" })
  @Column({ name: 'vendor_response', type: 'varchar', length: 1000, nullable: true })
  vendorResponse: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'applied_at', type: 'timestamp with time zone', nullable: true })
  appliedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'cancel_reason', type: 'varchar', length: 1000, nullable: true })
  cancelReason: string | null;

  @ApiProperty({ description: 'Admin who raised the deduction' })
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
