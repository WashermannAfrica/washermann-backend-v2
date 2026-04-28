import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { AssignmentStatus } from '../../common/enums/assignment-status.enum';
import { Company } from './company.entity';
import { Tier } from './tier.entity';
import { User } from './user.entity';

@Entity('company_employees')
@Unique(['companyId', 'userId'])
export class CompanyEmployee extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'tier_id', type: 'uuid', nullable: true })
  tierId: string | null;

  @ApiProperty({ enum: AssignmentStatus })
  @Column({
    name: 'assignment_status',
    type: 'varchar',
    length: 50,
    default: AssignmentStatus.ACTIVE,
  })
  assignmentStatus: AssignmentStatus;

  @ApiProperty()
  @Column({
    name: 'assigned_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  assignedAt: Date;

  @ApiProperty({ example: 'WM-EMP-AB1234' })
  @Column({ name: 'tracking_id', type: 'varchar', length: 20, unique: true, nullable: false })
  trackingId: string;

  @BeforeInsert()
  generateTrackingId() {
    if (!this.trackingId) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      this.trackingId = `WM-EMP-${suffix}`;
    }
  }

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Company, (c) => c.employeeAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Tier, (t) => t.employeeAssignments, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'tier_id' })
  tier: Tier | null;
}
