import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/** Workflow state of the DRAFT copy (the live snapshot is independent of this). */
export enum BlogPostStatus {
  /** Being written, or sent back with change requests */
  DRAFT = 'draft',
  /** Submitted — waiting for a different admin to approve (four-eyes) */
  IN_REVIEW = 'in_review',
  /** Draft == live snapshot; nothing pending */
  PUBLISHED = 'published',
  /** Hidden from the public site (snapshot retained) */
  ARCHIVED = 'archived',
}

/**
 * The immutable copy served to the public site. Approval copies the draft
 * fields into this snapshot — edits after publish never leak to readers
 * until re-approved (maker-checker, same staging idea as vendor pricing).
 */
export interface BlogPublishedSnapshot {
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  bodyHtml: string;
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  readingTimeMins: number;
}

@Entity('blog_posts')
export class BlogPost {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** URL identity — immutable after first publish (old links must never die) */
  @ApiProperty({ example: 'how-washpoints-work' })
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 220 })
  slug: string;

  // ─── Working draft (what admins edit) ────────────────────────────────────────

  @ApiProperty()
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @ApiProperty({ description: 'Plain-text summary for cards and meta description' })
  @Column({ type: 'varchar', length: 500, default: '' })
  excerpt: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'cover_image_url', type: 'varchar', length: 2000, nullable: true })
  coverImageUrl: string | null;

  @ApiProperty({ description: 'Sanitized HTML from the TipTap editor' })
  @Column({ name: 'body_html', type: 'text', default: '' })
  bodyHtml: string;

  @ApiProperty({ type: [String] })
  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @ApiProperty({ nullable: true, description: 'Overrides <title> when set' })
  @Column({ name: 'seo_title', type: 'varchar', length: 200, nullable: true })
  seoTitle: string | null;

  @ApiProperty({ nullable: true, description: 'Overrides meta description when set' })
  @Column({ name: 'seo_description', type: 'varchar', length: 320, nullable: true })
  seoDescription: string | null;

  @ApiProperty({ description: 'Computed from the draft body on save (~200 wpm)' })
  @Column({ name: 'reading_time_mins', type: 'int', default: 1 })
  readingTimeMins: number;

  // ─── Workflow ────────────────────────────────────────────────────────────────

  @ApiProperty({ enum: BlogPostStatus })
  @Index()
  @Column({ type: 'varchar', length: 20, default: BlogPostStatus.DRAFT })
  status: BlogPostStatus;

  /** The byline — the admin user who created the post. Approver must differ. */
  @ApiProperty()
  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @ApiProperty({ nullable: true, description: 'Admin who approved / requested changes last' })
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true, description: 'Reviewer note (shown to the author on request-changes)' })
  @Column({ name: 'review_note', type: 'varchar', length: 1000, nullable: true })
  reviewNote: string | null;

  // ─── Published snapshot (what the public site serves) ───────────────────────

  @ApiProperty({ nullable: true, description: 'Live copy — null until first approval' })
  @Column({ name: 'published_snapshot', type: 'jsonb', nullable: true })
  publishedSnapshot: BlogPublishedSnapshot | null;

  @ApiProperty({ nullable: true, description: 'Last approval time (bumped on every re-approve)' })
  @Index()
  @Column({ name: 'published_at', type: 'timestamp with time zone', nullable: true })
  publishedAt: Date | null;

  @ApiProperty({ nullable: true, description: 'First-ever approval — display date on the site' })
  @Column({ name: 'first_published_at', type: 'timestamp with time zone', nullable: true })
  firstPublishedAt: Date | null;

  @ApiProperty()
  @Column({ name: 'view_count', type: 'bigint', default: 0, transformer: BigIntTransformer })
  viewCount: number;

  // ─── Audit ───────────────────────────────────────────────────────────────────

  @ApiProperty({ nullable: true })
  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
