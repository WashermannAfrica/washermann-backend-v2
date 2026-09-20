import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type PolicyVersionStatus = 'draft' | 'published' | 'archived';

/**
 * One immutable version of a policy. Draft versions are editable; once PUBLISHED the
 * content is frozen (so a user's recorded consent always resolves to the exact text
 * they agreed to). Markdown is canonical; `contentHtml` is the sanitized render served
 * to the site; `contentHash` is SHA-256 of the markdown for integrity/dedupe.
 */
@Entity('policy_versions')
@Index(['policyId'])
@Index(['policyId', 'versionNumber'], { unique: true })
@Index(['status'])
export class PolicyVersion extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'policy_id', type: 'uuid' })
  policyId: string;

  @ApiProperty({ example: 3, description: 'Increments per policy, 1-based' })
  @Column({ name: 'version_number', type: 'int' })
  versionNumber: number;

  @ApiProperty({ enum: ['draft', 'published', 'archived'], default: 'draft' })
  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: PolicyVersionStatus;

  @ApiProperty({ description: 'Canonical source (Markdown)' })
  @Column({ name: 'content_markdown', type: 'text' })
  contentMarkdown: string;

  @ApiProperty({ description: 'Sanitized HTML render served to the site' })
  @Column({ name: 'content_html', type: 'text' })
  contentHtml: string;

  @ApiProperty({ description: 'SHA-256 of the markdown' })
  @Column({ name: 'content_hash', type: 'varchar', length: 64 })
  contentHash: string;

  @ApiProperty({ required: false, description: 'What changed vs the previous version' })
  @Column({ name: 'change_summary', type: 'varchar', length: 500, nullable: true })
  changeSummary: string | null;

  @ApiProperty({ example: '2026-09-01' })
  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @ApiProperty({
    default: false,
    description: 'If true, users who accepted an earlier version must re-accept this one',
  })
  @Column({ name: 'requires_reconsent', type: 'boolean', default: false })
  requiresReconsent: boolean;

  @ApiProperty({ enum: ['markdown', 'docx'], default: 'markdown' })
  @Column({ name: 'source_format', type: 'varchar', length: 16, default: 'markdown' })
  sourceFormat: string;

  @ApiProperty({ required: false })
  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @ApiProperty({ required: false })
  @Column({ name: 'published_by_user_id', type: 'uuid', nullable: true })
  publishedByUserId: string | null;
}
