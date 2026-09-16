import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A single audited event. One row per meaningful action anywhere on the platform
 * (any app → this API). Written fire-and-forget by the global AuditInterceptor
 * (and by services for richer events), read only by admins.
 *
 * Every requested filter maps to an indexed column:
 *  - app          → which application the action came from
 *  - actorType    → user type (admin / vendor / rep / customer / system …)
 *  - actorId      → a single person
 *  - category     → action group (order, vendor, payout, auth …)
 *  - action       → precise action key (vendor.verify, order.create …)
 *  - createdAt    → date range
 */
@Entity('audit_logs')
@Index(['createdAt'])
@Index(['app'])
@Index(['category'])
@Index(['action'])
@Index(['actorId'])
@Index(['actorType'])
@Index(['targetId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Application the action originated from', example: 'admin' })
  @Column({ type: 'varchar', length: 24, default: 'api' })
  app: string; // admin | vendor | rep | company | web | mobile | api | system

  @ApiProperty({ description: 'Action group', example: 'vendor' })
  @Column({ type: 'varchar', length: 40, default: 'general' })
  category: string;

  @ApiProperty({ description: 'Precise action key', example: 'vendor.verify' })
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @ApiProperty({ description: 'Human-readable sentence describing what happened' })
  @Column({ type: 'text' })
  description: string;

  // ─── Actor (who did it) ───────────────────────────────────────────────────────
  @ApiProperty({ nullable: true })
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ApiProperty({ description: 'Actor user type', example: 'admin' })
  @Column({ name: 'actor_type', type: 'varchar', length: 30, default: 'system' })
  actorType: string; // admin|finance|vendor|rep|sales_rep|company_owner|company_admin|user|system

  @ApiProperty({ nullable: true, description: 'Actor name snapshot at the time of the action' })
  @Column({ name: 'actor_name', type: 'varchar', length: 255, nullable: true })
  actorName: string | null;

  // ─── Target (what was acted on) ───────────────────────────────────────────────
  @ApiProperty({ nullable: true })
  @Column({ name: 'target_type', type: 'varchar', length: 40, nullable: true })
  targetType: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  @ApiProperty({ nullable: true, description: 'Readable label for the target (reference / name)' })
  @Column({ name: 'target_label', type: 'varchar', length: 255, nullable: true })
  targetLabel: string | null;

  // ─── Request context ──────────────────────────────────────────────────────────
  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  path: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  @ApiProperty({ description: 'Whether the action succeeded (status < 400)' })
  @Column({ type: 'boolean', default: true })
  success: boolean;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @ApiProperty({ nullable: true, description: 'Redacted structured detail (never secrets)' })
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
