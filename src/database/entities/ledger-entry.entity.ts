import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { Wallet } from './wallet.entity';
import { ConversionRate } from './conversion-rate.entity';
import {
  BigIntTransformer,
  DecimalTransformer,
} from '../../common/transformers/column.transformers';

/**
 * Immutable, append-only audit trail.
 *
 * Rules:
 *  - No UPDATE or DELETE path exists in the service layer.
 *  - balanceBefore + amount (credit) OR balanceBefore - amount (debit) === balanceAfter — always enforced at write time.
 *  - conversionRateSnapshot is frozen at write time so future rate changes never
 *    alter historical records.
 *  - No updatedAt column — immutability by design.
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @ApiProperty({ description: 'Denormalised userId for fast per-user queries' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ enum: ['credit', 'debit'] })
  @Column({ type: 'varchar', length: 10 })
  type: 'credit' | 'debit';

  @ApiProperty({ description: 'WashPoints — always a positive integer' })
  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  @ApiProperty({ description: 'WashPoints balance immediately before this entry' })
  @Column({ name: 'balance_before', type: 'bigint', transformer: BigIntTransformer })
  balanceBefore: number;

  @ApiProperty({ description: 'WashPoints balance immediately after this entry' })
  @Column({ name: 'balance_after', type: 'bigint', transformer: BigIntTransformer })
  balanceAfter: number;

  @ApiProperty({ enum: LedgerSource })
  @Column({ type: 'varchar', length: 50 })
  source: LedgerSource;

  @ApiProperty({ nullable: true, description: 'UUID FK to conversion_rates (TOPUP only)' })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Snapshot of pointsPerUnit at write time — never changes even if the rate is updated later',
  })
  @Column({
    name: 'conversion_rate_snapshot',
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    transformer: DecimalTransformer,
  })
  conversionRateSnapshot: number | null;

  @ApiProperty({ nullable: true, description: 'Vault the WP was sourced from (TOPUP entries only)' })
  @Column({ name: 'vault_id', nullable: true, comment: 'Vault the WP was sourced from (TOPUP entries only)' })
  vaultId: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Raw fiat paid in kobo (TOPUP entries only)',
  })
  @Column({
    name: 'fiat_amount_kobo',
    type: 'bigint',
    nullable: true,
    transformer: BigIntTransformer,
  })
  fiatAmountKobo: number | null;

  @ApiProperty({ nullable: true, example: 'NGN', description: 'ISO 4217 currency (TOPUP only)' })
  @Column({ name: 'fiat_currency', type: 'varchar', length: 10, nullable: true })
  fiatCurrency: string | null;

  @ApiProperty({ nullable: true, description: 'Paystack ref, order ref, etc.' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  reference: string | null;

  @ApiProperty()
  @Column({ type: 'varchar', length: 500 })
  description: string;

  @ApiProperty({ nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // ─── Relations (for joins only — never eager-loaded by default) ───────────────
  @ManyToOne(() => Wallet, { eager: false })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @ManyToOne(() => ConversionRate, { nullable: true, eager: false })
  @JoinColumn({ name: 'conversion_rate_id' })
  conversionRate: ConversionRate | null;
}
