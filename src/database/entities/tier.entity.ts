import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { CompanyEmployee } from './company-employee.entity';

export enum TierDuration {
  DAILY     = 'daily',
  WEEKLY    = 'weekly',
  MONTHLY   = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL    = 'annual',
}

@Entity('tiers')
export class Tier extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ApiProperty({ example: 'Senior Staff' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 500, description: 'WashPoints allocated per cycle' })
  @Column({
    name: 'points_per_cycle',
    type: 'bigint',
    default: 0,
    comment: 'WashPoints allocated per cycle',
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
  })
  pointsPerCycle: number;

  @ApiProperty({ example: 4, description: 'Max orders per cycle' })
  @Column({ name: 'monthly_order_limit', type: 'int' })
  monthlyOrderLimit: number;

  @ApiProperty({ example: 10, description: 'Max items per order' })
  @Column({ name: 'item_limit', type: 'int' })
  itemLimit: number;

  @ApiProperty({ enum: TierDuration, default: TierDuration.MONTHLY })
  @Column({
    type: 'varchar',
    length: 20,
    default: TierDuration.MONTHLY,
    nullable: false,
  })
  duration: TierDuration;

  @ApiProperty({
    example: 1,
    description:
      'Recurrence interval multiplier applied to `duration` — e.g. interval 3 + duration "daily" = every 3 days.',
  })
  @Column({ name: 'interval_count', type: 'int', default: 1 })
  intervalCount: number;

  @ApiProperty({ example: 0, description: 'Max WP a single worker can spend per cycle (0 = no cap)' })
  @Column({
    name: 'spending_cap_per_cycle',
    type: 'bigint',
    default: 0,
    comment: 'Max WP a single worker can spend per cycle (0 = no cap)',
    transformer: { to: (v: number) => v, from: (v: string) => parseInt(v, 10) },
  })
  spendingCapPerCycle: number;

  @ApiProperty({ nullable: true, description: 'Staged tier changes to apply at start of next cycle' })
  @Column({
    name: 'pending_changes',
    type: 'jsonb',
    nullable: true,
    comment: 'Staged tier changes to apply at start of next cycle',
  })
  pendingChanges: Record<string, any> | null;

  @ApiProperty({ nullable: true, description: 'When pendingChanges take effect' })
  @Column({
    name: 'pending_effective_from',
    type: 'timestamp',
    nullable: true,
    comment: 'When pendingChanges take effect',
  })
  pendingEffectiveFrom: Date | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Company, (c) => c.tiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => CompanyEmployee, (ce) => ce.tier)
  employeeAssignments: CompanyEmployee[];
}
