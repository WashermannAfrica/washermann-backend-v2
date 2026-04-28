import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { User } from './user.entity';
import { ConversionRate } from './conversion-rate.entity';
import {
  BigIntTransformer,
  DecimalTransformer,
} from '../../common/transformers/column.transformers';

/**
 * One record per Paystack payment attempt.
 *
 * - reference:              our generated reference (wm_<uuid>), used for Paystack init + verify
 * - conversionRateId/Snapshot: locked at initiation time — the rate is frozen when the user
 *   clicks "Buy WashPoints", not when the webhook fires. Prevents rate-change exploitation.
 * - webhookData:            last raw Paystack webhook payload (for audit / replay)
 */
@Entity('paystack_transactions')
export class PaystackTransaction extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Our generated reference: wm_<uuid>' })
  @Column({ type: 'varchar', length: 100, unique: true })
  reference: string;

  @ApiProperty({ description: 'Amount in kobo' })
  @Column({ name: 'amount_kobo', type: 'bigint', transformer: BigIntTransformer })
  amountKobo: number;

  @ApiProperty({ example: 'NGN' })
  @Column({ type: 'varchar', length: 10, default: 'NGN' })
  currency: string;

  @ApiProperty({ description: 'UUID of the conversion rate locked at initiation', nullable: true })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  @ApiProperty({ description: 'Frozen pointsPerUnit at initiation time', nullable: true })
  @Column({
    name: 'conversion_rate_snapshot',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: DecimalTransformer,
  })
  conversionRateSnapshot: number | null;

  @ApiProperty({ description: 'Vault used for this top-up', nullable: true })
  @Column({ name: 'vault_id', nullable: true, comment: 'Vault used for this top-up' })
  vaultId: string | null;

  @ApiProperty({ description: 'Set for company wallet top-ups', nullable: true })
  @Column({ name: 'company_id', nullable: true, comment: 'Set for company wallet top-ups' })
  companyId: string | null;

  @ApiProperty({ description: 'WashPoints credited on success', nullable: true })
  @Column({
    name: 'wash_points_credited',
    type: 'bigint',
    nullable: true,
    transformer: BigIntTransformer,
  })
  washPointsCredited: number | null;

  @ApiProperty({ enum: TransactionStatus })
  @Column({ type: 'varchar', length: 20, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @ApiProperty({ description: 'card | bank_transfer | ussd | etc.', nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  channel: string | null;

  @ApiProperty({ description: "Paystack's own transaction reference", nullable: true })
  @Column({ name: 'paystack_reference', type: 'varchar', length: 255, nullable: true })
  paystackReference: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty({ description: 'Last raw Paystack webhook payload (audit trail)', nullable: true })
  @Column({ name: 'webhook_data', type: 'jsonb', nullable: true })
  webhookData: Record<string, unknown> | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ConversionRate, { nullable: true, eager: false })
  @JoinColumn({ name: 'conversion_rate_id' })
  conversionRate: ConversionRate | null;
}
