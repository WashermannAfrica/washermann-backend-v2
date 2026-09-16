import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * One FCM registration token per device a user is signed in on. A user can have
 * many (phone, tablet, web) — push notifications fan out to all of them, and dead
 * tokens are pruned automatically when FCM reports them unregistered.
 *
 * `token` is unique: if a device is handed to another user, registering it again
 * simply re-points the row to the new user.
 */
@Entity('device_tokens')
@Index(['userId'])
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'FCM registration token' })
  @Column({ type: 'varchar', length: 1000, unique: true })
  token: string;

  @ApiProperty({ nullable: true, description: 'android | ios | web' })
  @Column({ type: 'varchar', length: 20, nullable: true })
  platform: string | null;

  @ApiProperty()
  @Column({ name: 'last_seen_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
