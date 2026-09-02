import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';

export type SupportConversationStatus = 'open' | 'pending' | 'closed';

/**
 * A support thread between one app user (customer, vendor or wash rep) and the
 * support agents. One persistent conversation per user.
 */
@Entity('support_conversations')
@Index(['userId'], { unique: true })
@Index(['status'])
export class SupportConversation extends BaseEntity {
  @ApiProperty({ description: 'The app user this thread belongs to' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Primary role of the user (customer | vendor | rep | …)' })
  @Column({ name: 'user_role', type: 'varchar', length: 30, default: 'user' })
  userRole: string;

  @ApiProperty({ enum: ['open', 'pending', 'closed'] })
  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: SupportConversationStatus;

  @ApiProperty({ nullable: true, description: 'Agent currently handling it' })
  @Column({ name: 'assigned_agent_id', type: 'uuid', nullable: true })
  assignedAgentId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'last_message_at', type: 'timestamp with time zone', nullable: true })
  lastMessageAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'last_message_preview', type: 'varchar', length: 300, nullable: true })
  lastMessagePreview: string | null;

  @ApiProperty({ description: 'Messages the user has not read (from agents)' })
  @Column({ name: 'unread_for_user', type: 'int', default: 0 })
  unreadForUser: number;

  @ApiProperty({ description: 'Messages the agents have not read (from the user)' })
  @Column({ name: 'unread_for_agent', type: 'int', default: 0 })
  unreadForAgent: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
