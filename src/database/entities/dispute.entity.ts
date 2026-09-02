import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';
import { User } from './user.entity';
import { DisputeEvent } from './dispute-event.entity';
import { DisputeStatus } from '../../common/enums/dispute.enum';

/** One affected garment line the customer flagged (mirrors an order line item). */
export interface DisputeAffectedItem {
  label: string;
  qty: number;
}

@Entity('disputes')
@Index(['raisedByUserId'])
@Index(['orderId'])
@Index(['status'])
export class Dispute extends BaseEntity {
  @ApiProperty({ example: 'DSP-K7M3N1' })
  @Column({ type: 'varchar', length: 20, unique: true })
  reference: string;

  @ApiProperty()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ApiProperty({ description: 'The customer who raised it' })
  @Column({ name: 'raised_by_user_id', type: 'uuid' })
  raisedByUserId: string;

  @ApiProperty({ example: 'torn' })
  @Column({ name: 'issue_type', type: 'varchar', length: 40 })
  issueType: string;

  @ApiProperty()
  @Column({ type: 'text' })
  description: string;

  @ApiProperty({ type: 'array', items: { type: 'object' }, description: 'Affected items [{label, qty}]' })
  @Column({ name: 'affected_items', type: 'jsonb', default: '[]' })
  affectedItems: DisputeAffectedItem[];

  @ApiProperty({ type: [String], description: 'Preferred resolutions: refund | rewash | compensation' })
  @Column({ name: 'preferred_resolutions', type: 'jsonb', default: '[]' })
  preferredResolutions: string[];

  @ApiProperty({ type: [String], description: 'Evidence image URLs' })
  @Column({ name: 'evidence_urls', type: 'jsonb', default: '[]' })
  evidenceUrls: string[];

  @ApiProperty({ enum: DisputeStatus })
  @Column({ type: 'varchar', length: 20, default: DisputeStatus.REPORTED })
  status: DisputeStatus;

  // ─── Resolution ───────────────────────────────────────────────────────────────
  @ApiProperty({ nullable: true, description: 'refund | rewash | compensation | rejected' })
  @Column({ name: 'resolution_outcome', type: 'varchar', length: 20, nullable: true })
  resolutionOutcome: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @ApiProperty({ nullable: true, description: 'WashPoints credited to the customer as part of the resolution' })
  @Column({ name: 'refunded_wp', type: 'bigint', nullable: true })
  refundedWp: number | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'resolved_at', type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;

  // ─── Relations ────────────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'order_id' })
  order?: Order;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'raised_by_user_id' })
  raisedBy?: User;

  @OneToMany(() => DisputeEvent, (e) => e.dispute)
  events?: DisputeEvent[];
}
