import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * One wallet per user. Balance is stored in WashPoints (integer).
 *
 * fiatBalanceKobo tracks the actual Naira value (in kobo) of the WP currently
 * in this wallet, based on what the user PAID for each batch — not the current
 * platform conversion rate. This is the "cost basis" of the wallet.
 *
 * Rules:
 *  - TOP_UP credit:  fiatBalanceKobo += fiatAmountKobo paid for that batch
 *  - ORDER debit:    fiatBalanceKobo -= round((amountDebited / balanceBefore) × fiatBalanceBefore)
 *  - REFUND credit:  fiatBalanceKobo += round((amountRefunded / balanceBeforeRefund) × ...)
 *    (uses the same proportional weighted-average approach)
 */
@Entity('wallets')
export class Wallet extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({
    description: 'Current WashPoints balance. Stored as BIGINT; never negative.',
    example: 1250,
  })
  @Column({
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  balance: number;

  @ApiProperty({
    description:
      'Actual fiat cost-basis of the current WP balance, in Naira kobo. ' +
      'Reflects the sum of real money paid for each WP batch, proportionally ' +
      'reduced as WPs are spent. Divide by 100 for Naira.',
    example: 35000,
  })
  @Column({
    name: 'fiat_balance_kobo',
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  fiatBalanceKobo: number;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
