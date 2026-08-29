import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

export type SalesRepStatus = 'onboarding' | 'active' | 'suspended';

/**
 * Sales-rep profile (1:1 with a user holding Role.SALES_REP).
 * Created on application acceptance in 'onboarding'; flips to 'active' once the
 * assessment hard gate is passed (which also issues the referral code).
 */
@Entity('sales_reps')
export class SalesRep extends BaseEntity {
  @ApiProperty()
  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId: string | null;

  @ApiProperty({ enum: ['onboarding', 'active', 'suspended'] })
  @Column({ type: 'varchar', length: 20, default: 'onboarding' })
  status: SalesRepStatus;

  @ApiProperty({ description: 'Whether the onboarding assessment has been passed' })
  @Column({ name: 'assessment_passed', type: 'boolean', default: false })
  assessmentPassed: boolean;

  @ApiProperty({ description: 'Best assessment score (%)' })
  @Column({ name: 'best_score_pct', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalTransformer })
  bestScorePct: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'passed_at', type: 'timestamp with time zone', nullable: true })
  passedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Set when admin upgrades the sales rep to a wash rep' })
  @Column({ name: 'upgraded_to_rep_at', type: 'timestamp with time zone', nullable: true })
  upgradedToRepAt: Date | null;

  // ─── Cash payout destination (set by the rep) ─────────────────────────────────
  @ApiProperty({ nullable: true })
  @Column({ name: 'bank_code', type: 'varchar', length: 20, nullable: true })
  bankCode: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'account_number', type: 'varchar', length: 20, nullable: true })
  accountNumber: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'account_name', type: 'varchar', length: 255, nullable: true })
  accountName: string | null;

  // ─── Soft-delete (admin archive) ──────────────────────────────────────────────
  @ApiProperty({ nullable: true, description: 'Set when an admin removes (archives) the sales rep. Excluded from the default list; history preserved.' })
  @Column({ name: 'deactivated_at', type: 'timestamp with time zone', nullable: true })
  deactivatedAt: Date | null;
}
