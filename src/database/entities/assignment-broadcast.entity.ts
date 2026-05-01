import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Order } from './order.entity';

/** Which actor type was being broadcast to */
export type BroadcastTargetType = 'rep' | 'vendor';

/** Status of this individual broadcast notification */
export type BroadcastRecordStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

/**
 * Records every broadcast notification sent during assignment.
 *
 * One row per (order, batch, recipient).
 * Used to:
 *  - Track acceptance/decline/expiry
 *  - Prevent double-assigning
 *  - Audit assignment history
 */
@Entity('assignment_broadcasts')
export class AssignmentBroadcast {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ApiProperty({ enum: ['rep', 'vendor'] })
  @Column({ name: 'target_type', type: 'varchar', length: 10 })
  targetType: BroadcastTargetType;

  @ApiProperty({ description: 'UUID of the rep or vendor record' })
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @ApiProperty({ description: 'Batch number (1 = first broadcast, 2 = second, ...)' })
  @Column({ name: 'batch_number', type: 'int', default: 1 })
  batchNumber: number;

  @ApiProperty({ description: 'Computed priority score at the time of broadcast' })
  @Column({ name: 'priority_score', type: 'float', default: 0 })
  priorityScore: number;

  @ApiProperty({ enum: ['pending', 'accepted', 'declined', 'expired', 'cancelled'] })
  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BroadcastRecordStatus;

  @ApiProperty({ nullable: true })
  @Column({ name: 'responded_at', type: 'timestamp with time zone', nullable: true })
  respondedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'Timestamp when this broadcast window expires' })
  @Column({ name: 'expires_at', type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { eager: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
