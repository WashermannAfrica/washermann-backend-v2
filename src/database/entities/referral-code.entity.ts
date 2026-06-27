import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type ReferrerType = 'sales_rep' | 'rep' | 'customer' | 'vendor';
export type ReferredType = 'customer' | 'vendor';

/**
 * One unique, collision-proof referral code per referrer. Issued on account
 * creation (customers/vendors) or on assessment-pass (sales reps).
 */
@Entity('referral_codes')
export class ReferralCode extends BaseEntity {
  @ApiProperty({ example: 'WM-AB12CD' })
  @Column({ type: 'varchar', length: 24, unique: true })
  code: string;

  @ApiProperty()
  @Index({ unique: true })
  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @ApiProperty({ enum: ['sales_rep', 'rep', 'customer', 'vendor'] })
  @Column({ name: 'owner_type', type: 'varchar', length: 20 })
  ownerType: ReferrerType;

  @ApiProperty()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
