import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * A legal/policy document in the CMS (e.g. "privacy-policy", "terms-of-service").
 * The document's actual text lives in immutable PolicyVersion rows; this row is the
 * stable identity + slug the public site and consent links point at. `currentVersionId`
 * names the version currently served at /policies/:key.
 */
@Entity('policies')
export class Policy extends BaseEntity {
  @ApiProperty({ example: 'privacy-policy', description: 'Stable URL slug — never changes once links point at it' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, unique: true })
  key: string;

  @ApiProperty({ example: 'Privacy Policy' })
  @Column({ type: 'varchar', length: 160 })
  title: string;

  @ApiProperty({ required: false })
  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  @ApiProperty({
    description: 'Which portals must present/accept this policy',
    example: ['customer', 'vendor'],
  })
  @Column({ name: 'audiences', type: 'simple-array', default: '' })
  audiences: string[];

  @ApiProperty({ description: 'The version currently published/served, if any' })
  @Column({ name: 'current_version_id', type: 'uuid', nullable: true })
  currentVersionId: string | null;

  @ApiProperty({ default: 0 })
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
