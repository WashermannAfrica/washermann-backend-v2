import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Dispute } from './dispute.entity';

/**
 * One entry in a dispute's resolution timeline (Reported → Under review →
 * Investigating → Resolved/Rejected). Append-only.
 */
@Entity('dispute_events')
@Index(['disputeId'])
export class DisputeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'dispute_id', type: 'uuid' })
  disputeId: string;

  @ApiProperty({ description: 'Status this event moved the dispute to' })
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @ApiProperty({ nullable: true, description: 'Human note shown on the timeline' })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @ApiProperty({ nullable: true, description: 'Who advanced it: customer | dispute_resolver | admin | system' })
  @Column({ name: 'actor_role', type: 'varchar', length: 30, nullable: true })
  actorRole: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => Dispute, (d) => d.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'dispute_id' })
  dispute?: Dispute;
}
