import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';

export enum CompanyWalletStatus {
  ACTIVE = 'active',
  FROZEN = 'frozen', // company suspended
}

@Entity('company_wallets')
export class CompanyWallet extends BaseEntity {
  @Column({ name: 'company_id' })
  companyId: string;

  @OneToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({
    name: 'wp_balance',
    type: 'bigint',
    default: 0,
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
    comment: 'WashPoints balance',
  })
  wpBalance: number;

  @Column({
    type: 'enum',
    enum: CompanyWalletStatus,
    default: CompanyWalletStatus.ACTIVE,
  })
  status: CompanyWalletStatus;
}
