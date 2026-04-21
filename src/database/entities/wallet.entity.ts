import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * One wallet per user. Balance is stored in WashPoints (integer).
 * Fiat is never stored here — convert at top-up time, forget the raw Naira.
 * Total fiat spent is derivable from paystack_transactions.
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

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
