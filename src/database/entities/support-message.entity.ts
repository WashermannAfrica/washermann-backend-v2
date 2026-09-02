import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { SupportConversation } from './support-conversation.entity';

export type SupportSenderType = 'user' | 'agent' | 'system';

@Entity('support_messages')
@Index(['conversationId', 'createdAt'])
export class SupportMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ApiProperty({ nullable: true, description: 'User/agent id; null for system messages' })
  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId: string | null;

  @ApiProperty({ enum: ['user', 'agent', 'system'] })
  @Column({ name: 'sender_type', type: 'varchar', length: 10 })
  senderType: SupportSenderType;

  @ApiProperty({ nullable: true, description: 'Snapshot of the sender name for display' })
  @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
  senderName: string | null;

  @ApiProperty()
  @Column({ type: 'text' })
  body: string;

  @ApiProperty({ type: [String], nullable: true, description: 'Attachment image URLs' })
  @Column({ type: 'jsonb', nullable: true })
  attachments: string[] | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => SupportConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: SupportConversation;
}
