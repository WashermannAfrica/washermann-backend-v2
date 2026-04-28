import { Column, CreateDateColumn, Entity, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CompanyWallet } from './company-wallet.entity';

export enum CompanyLedgerSource {
  TOPUP               = 'topup',
  BENEFIT_ALLOCATION  = 'benefit_allocation',
  BENEFIT_RETURN      = 'benefit_return',       // WP returned when worker deactivated
  GIFT_CARD_CREATION  = 'gift_card_creation',
  GIFT_CARD_REVOCATION = 'gift_card_revocation',
  ADMIN_CREDIT        = 'admin_credit',
  ADMIN_DEBIT         = 'admin_debit',
}

export enum CompanyLedgerType {
  CREDIT = 'credit',
  DEBIT  = 'debit',
}

@Entity('company_ledger_entries')
export class CompanyLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_wallet_id' })
  companyWalletId: string;

  @ManyToOne(() => CompanyWallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_wallet_id' })
  companyWallet: CompanyWallet;

  @Column({ name: 'company_id', comment: 'Denormalized for fast queries' })
  companyId: string;

  @Column({ type: 'enum', enum: CompanyLedgerType })
  type: CompanyLedgerType;

  @Column({
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
    comment: 'WashPoints amount',
  })
  amount: number;

  @Column({
    name: 'balance_before',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
  })
  balanceBefore: number;

  @Column({
    name: 'balance_after',
    type: 'bigint',
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
  })
  balanceAfter: number;

  @Column({ type: 'enum', enum: CompanyLedgerSource })
  source: CompanyLedgerSource;

  @Column({
    name: 'fiat_amount_kobo',
    type: 'bigint',
    nullable: true,
    transformer: { to: (v: number | null) => v, from: (v: string | null) => v !== null ? parseInt(v, 10) : null },
    comment: 'Fiat paid (kobo) for TOPUP entries',
  })
  fiatAmountKobo: number | null;

  @Column({ length: 40, comment: 'Human-readable reference e.g. TXN-20260411-000001' })
  reference: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
