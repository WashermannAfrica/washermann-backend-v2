import { Column, Entity, OneToMany } from 'typeorm';
import { ApiProperty, ApiHideProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { BaseEntity } from './base.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { Role } from '../../common/enums/roles.enum';
import { Address } from './address.entity';

@Entity('users')
export class User extends BaseEntity {
  @ApiProperty({ example: 'John Doe' })
  @Column({ name: 'full_name', type: 'varchar', length: 255 })
  fullName: string;

  @ApiProperty({ example: 'john@example.com', nullable: true })
  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string;

  @ApiProperty({ example: '+2348012345678', nullable: true })
  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  phone: string;

  @ApiHideProperty()
  @Exclude()
  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string;

  @ApiProperty({ enum: Role, isArray: true })
  @Column({
    type: 'simple-array',
    default: Role.USER,
  })
  roles: Role[];

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  @Column({
    type: 'varchar',
    length: 50,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @ApiProperty({ example: false, description: 'Whether email has been verified via OTP' })
  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  @ApiProperty({ example: false, description: 'Whether phone has been verified via OTP' })
  @Column({ name: 'phone_verified', type: 'boolean', default: false })
  phoneVerified: boolean;

  @ApiProperty({ nullable: true, description: 'Cloudinary URL of profile picture' })
  @Column({ name: 'avatar_url', type: 'varchar', length: 2000, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ nullable: true, description: 'Firebase FCM device token for push notifications' })
  @Column({ name: 'fcm_token', type: 'varchar', length: 1000, nullable: true })
  fcmToken: string | null;

  // ─── Relations (populated in later phases) ──────────────────────────────────
  @OneToMany(() => Address, (address) => address.user, { cascade: true })
  addresses: Address[];
}
