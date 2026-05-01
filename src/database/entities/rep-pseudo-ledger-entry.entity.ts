import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { RepPseudoWallet } from './rep-pseudo-wallet.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';
import { LedgerSource } from '../../common/enums/ledger-source.enum';

/**
 * Immutable, append-only audit trail for rep pseudo-wallet.
 * No UPDATE or DELETE path exists in the service layer.
 * Visible to admins only.
 */
@Entity('rep_pseudo_ledger_entries')
export class RepPseudoLedgerEntry {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @ApiProperty({ description: 'Denormalised repId for fast per-rep queries' })
  @Column({ name: 'rep_id', type: 'uuid' })
  repId: string;

  @ApiProperty({ enum: ['credit', 'debit'] })
  @Column({ type: 'varchar', length: 10 })
  type: 'credit' | 'debit';

  @ApiProperty({ description: 'WashPoints — always positive' })
  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  @ApiProperty()
  @Column({ name: 'balance_before', type: 'bigint', transformer: BigIntTransformer })
  balanceBefore: number;

  @ApiProperty()
  @Column({ name: 'balance_after', type: 'bigint', transformer: BigIntTransformer })
  balanceAfter: number;

  @ApiProperty({ enum: LedgerSource })
  @Column({ type: 'varchar', length: 50 })
  source: LedgerSource;

  @ApiProperty({ nullable: true, description: 'FK to orders.id when source = REP_EARNING' })
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId: string | null;

  @ApiProperty({ nullable: true })
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

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => RepPseudoWallet, { eager: false })
  @JoinColumn({ name: 'wallet_id' })
  wallet: RepPseudoWallet;
}
