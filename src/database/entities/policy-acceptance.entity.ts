import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type ConsentMethod = 'signup' | 'onboarding' | 'reconsent' | 'explicit';

/**
 * An immutable record that a user accepted a specific PolicyVersion. This is the
 * legal evidence of consent — it pins the exact version (and its content hash), the
 * moment, and how it was captured. `createdAt` (BaseEntity) is the acceptance time.
 */
@Entity('policy_acceptances')
@Index(['userId'])
@Index(['userId', 'policyKey'])
@Index(['userId', 'versionId'], { unique: true })
export class PolicyAcceptance extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty()
  @Column({ name: 'policy_id', type: 'uuid' })
  policyId: string;

  @ApiProperty({ example: 'privacy-policy' })
  @Column({ name: 'policy_key', type: 'varchar', length: 80 })
  policyKey: string;

  @ApiProperty()
  @Column({ name: 'version_id', type: 'uuid' })
  versionId: string;

  @ApiProperty({ example: 3 })
  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @ApiProperty({ description: 'SHA-256 of the exact text accepted' })
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  @ApiProperty({ enum: ['signup', 'onboarding', 'reconsent', 'explicit'] })
  @Column({ type: 'varchar', length: 16 })
  method: ConsentMethod;

  @ApiProperty({ required: false })
  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @ApiProperty({ required: false })
  @Column({ name: 'user_agent', type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;
}
