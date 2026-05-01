import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Rep } from './rep.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * Internal operations tool — NOT visible to reps.
 *
 * Gives ops team an auditable WP record of each rep's delivery earnings
 * used to calculate their external Naira salary + bonus each cycle.
 *
 * balance: current cycle WP (reset to 0 at start of each bonus cycle)
 * totalEarned: all-time WP, never decremented
 */
@Entity('rep_pseudo_wallets')
export class RepPseudoWallet extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'rep_id', type: 'uuid', unique: true })
  repId: string;

  @ApiProperty({ description: 'Current cycle WashPoints balance' })
  @Column({
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  balance: number;

  @ApiProperty({ description: 'All-time WashPoints earned — never reset' })
  @Column({
    name: 'total_earned',
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  totalEarned: number;

  @ApiProperty({ nullable: true, description: 'Start of current bonus cycle' })
  @Column({ name: 'cycle_started_at', type: 'timestamp with time zone', nullable: true })
  cycleStartedAt: Date | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToOne(() => Rep, { eager: false })
  @JoinColumn({ name: 'rep_id' })
  rep: Rep;
}
