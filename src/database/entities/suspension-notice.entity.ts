import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type SuspensionSubjectType = 'vendor' | 'rep';
export type SuspensionNoticeStatus =
  | 'notice'        // issued; awaiting response / enforcement
  | 'withdrawn'     // admin cancelled — no suspension
  | 'suspended'     // suspension in effect
  | 'under_review'  // suspended party requested internal review
  | 'reinstated';   // review overturned / reactivated

/**
 * Due-process record for suspending a vendor or rep (WS4 1.14). Ordinary
 * suspensions go through a notice + response window before enforcement; fraud/
 * safety cases may be suspended immediately (`immediate = true`). A suspended
 * party may request an internal review.
 */
@Entity('suspension_notices')
@Index(['subjectType', 'subjectId'])
@Index(['status'])
export class SuspensionNotice extends BaseEntity {
  @ApiProperty({ enum: ['vendor', 'rep'] })
  @Column({ name: 'subject_type', type: 'varchar', length: 10 })
  subjectType: SuspensionSubjectType;

  @ApiProperty({ description: 'Vendor id or Rep id' })
  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId: string;

  @ApiProperty({ description: 'The subject’s user id (for notifications/ownership)' })
  @Column({ name: 'subject_user_id', type: 'uuid' })
  subjectUserId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 1000 })
  reason: string;

  @ApiProperty({ enum: ['notice', 'withdrawn', 'suspended', 'under_review', 'reinstated'], default: 'notice' })
  @Column({ type: 'varchar', length: 16, default: 'notice' })
  status: SuspensionNoticeStatus;

  @ApiProperty({ description: 'Fraud/safety immediate suspension (no response window)' })
  @Column({ type: 'boolean', default: false })
  immediate: boolean;

  @ApiProperty({ nullable: true, description: 'Deadline for the party to respond/remedy before enforcement' })
  @Column({ name: 'respond_by', type: 'timestamp with time zone', nullable: true })
  respondBy: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'response', type: 'varchar', length: 1000, nullable: true })
  response: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'responded_at', type: 'timestamp with time zone', nullable: true })
  respondedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'suspended_at', type: 'timestamp with time zone', nullable: true })
  suspendedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'review_requested_at', type: 'timestamp with time zone', nullable: true })
  reviewRequestedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'review_note', type: 'varchar', length: 1000, nullable: true })
  reviewNote: string | null;

  @ApiProperty({ nullable: true, enum: ['upheld', 'overturned'] })
  @Column({ name: 'review_decision', type: 'varchar', length: 12, nullable: true })
  reviewDecision: 'upheld' | 'overturned' | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'review_decided_at', type: 'timestamp with time zone', nullable: true })
  reviewDecidedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ description: 'Admin who issued the notice/suspension' })
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;
}
