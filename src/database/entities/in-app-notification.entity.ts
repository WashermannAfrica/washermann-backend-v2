import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export type InAppNotificationType =
  | 'order'
  | 'assignment'
  | 'payout'
  | 'account'
  | 'general';

@Entity('in_app_notifications')
export class InAppNotification {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Recipient user ID' })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 1000 })
  body: string;

  @ApiProperty({ enum: ['order', 'assignment', 'payout', 'account', 'general'] })
  @Column({ type: 'varchar', length: 50, default: 'general' })
  type: InAppNotificationType;

  @ApiProperty({ nullable: true, description: 'Extra context — orderId, payoutId, etc.' })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @ApiProperty({ default: false })
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @ApiProperty({ nullable: true })
  @Column({ name: 'read_at', type: 'timestamp with time zone', nullable: true })
  readAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
