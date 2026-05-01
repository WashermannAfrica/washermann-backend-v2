import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Vendor } from './vendor.entity';
import { PayoutStatus } from '../../common/enums/payout-status.enum';
import { BigIntTransformer, DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Vendor payout request.
 *
 * Flow: pending → processing → completed | failed
 *
 * Naira amount is calculated at request time using the payout rate.
 * The payout rate is snapshotted so future rate changes don't affect pending requests.
 */
@Entity('payout_requests')
export class PayoutRequest extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @ApiProperty({ description: 'WashPoints amount to payout' })
  @Column({
    name: 'amount_wp',
    type: 'bigint',
    transformer: BigIntTransformer,
  })
  amountWP: number;

  @ApiProperty({ description: 'Naira equivalent calculated at request time' })
  @Column({
    name: 'naira_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: DecimalTransformer,
  })
  nairaAmount: number;

  @ApiProperty({ description: 'Payout rate (Naira/WP) snapshotted at request time' })
  @Column({
    name: 'payout_rate_snapshot',
    type: 'decimal',
    precision: 10,
    scale: 4,
    transformer: DecimalTransformer,
  })
  payoutRateSnapshot: number;

  @ApiProperty({ example: '044' })
  @Column({ name: 'bank_code', type: 'varchar', length: 20 })
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @Column({ name: 'account_number', type: 'varchar', length: 20 })
  accountNumber: string;

  @ApiProperty({ example: 'Sparkle Cleaners Ltd' })
  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName: string;

  @ApiProperty({ enum: PayoutStatus })
  @Column({
    type: 'varchar',
    length: 20,
    default: PayoutStatus.PENDING,
  })
  status: PayoutStatus;

  @ApiProperty({ nullable: true, description: 'Paystack transfer reference' })
  @Column({ name: 'paystack_reference', type: 'varchar', length: 255, nullable: true })
  paystackReference: string | null;

  @ApiProperty({ nullable: true, description: 'Paystack transfer code' })
  @Column({ name: 'paystack_transfer_code', type: 'varchar', length: 255, nullable: true })
  paystackTransferCode: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'processed_at', type: 'timestamp with time zone', nullable: true })
  processedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'failure_reason', type: 'varchar', length: 1000, nullable: true })
  failureReason: string | null;

  @ApiProperty({ nullable: true, description: 'Admin who approved this payout' })
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Weekly payout batch run ID if processed in bulk' })
  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Vendor, { eager: false })
  @JoinColumn({ name: 'vendor_id' })
  vendor: Vendor;
}
