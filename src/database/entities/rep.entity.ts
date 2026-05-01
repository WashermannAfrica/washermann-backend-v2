import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { RepStatus } from '../../common/enums/rep-status.enum';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Platform field agent (logistics) record.
 *
 * Reps are created by admin only — they cannot self-register.
 * One-to-one with a User account that carries the 'rep' role.
 *
 * areaIds: UUIDs of Area records the rep serves (JSONB array).
 * isAvailable: rep toggles this when going on/off duty.
 * assignmentPriority: admin-set rank used as tiebreaker when priority scores are equal.
 * flaggedForReview: auto-set when rating drops below LOW_RATING_THRESHOLD.
 */
@Entity('reps')
export class Rep extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @ApiProperty({ description: 'Area UUIDs this rep serves', type: [String] })
  @Column({ name: 'area_ids', type: 'jsonb', default: '[]' })
  areaIds: string[];

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @ApiProperty({ nullable: true, description: 'URL of signed contract document' })
  @Column({ name: 'contract_url', type: 'varchar', length: 2000, nullable: true })
  contractUrl: string | null;

  @ApiProperty({ enum: RepStatus })
  @Column({
    type: 'varchar',
    length: 20,
    default: RepStatus.ACTIVE,
  })
  status: RepStatus;

  @ApiProperty({ default: false })
  @Column({ name: 'is_available', type: 'boolean', default: false })
  isAvailable: boolean;

  @ApiProperty({
    description: 'Admin-set priority rank; lower = higher priority in broadcast queue',
    example: 1,
  })
  @Column({ name: 'assignment_priority', type: 'int', default: 100 })
  assignmentPriority: number;

  @ApiProperty({ description: 'Rolling 30-day average rating (1–5)', example: 4.7 })
  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
    transformer: DecimalTransformer,
  })
  rating: number;

  @ApiProperty({ description: 'Total number of ratings ever received' })
  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  @ApiProperty({
    default: false,
    description: 'Auto-set when rating drops below threshold; cleared manually by admin',
  })
  @Column({ name: 'flagged_for_review', type: 'boolean', default: false })
  flaggedForReview: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'flagged_at', type: 'timestamp with time zone', nullable: true })
  flaggedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Admin notes about this rep' })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
