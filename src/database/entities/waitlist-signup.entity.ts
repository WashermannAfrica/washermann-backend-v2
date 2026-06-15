import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type WaitlistSegment = 'individual' | 'company';
export type WaitlistSource = 'hero' | 'waitlist' | 'final-cta';

/**
 * Landing-page waitlist signup (pre-launch lead capture).
 *
 * Captured from the public marketing site. Email is unique — repeat signups
 * update the existing record rather than creating duplicates.
 */
@Entity('waitlist_signups')
export class WaitlistSignup extends BaseEntity {
  @ApiProperty({ example: 'ada@example.com' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @ApiProperty({ example: 'Ada Okafor' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ example: 'individual', enum: ['individual', 'company'] })
  @Column({ type: 'varchar', length: 20, default: 'individual' })
  segment: WaitlistSegment;

  @ApiProperty({ example: 'hero', enum: ['hero', 'waitlist', 'final-cta'] })
  @Column({ type: 'varchar', length: 20, default: 'waitlist' })
  source: WaitlistSource;
}
