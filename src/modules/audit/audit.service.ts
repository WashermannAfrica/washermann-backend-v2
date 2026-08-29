import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { primaryActorType } from './audit-describe';

export interface RecordAuditInput {
  app?: string;
  category: string;
  action: string;
  description: string;
  actorId?: string | null;
  actorType?: string;
  actorName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  success?: boolean;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  search?: string;
  app?: string;
  category?: string;
  action?: string;
  actorType?: string;
  actorId?: string;
  targetId?: string;
  success?: boolean;
  from?: string; // ISO date
  to?: string; // ISO date
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * Record an event attributed to a specific user, resolving their name + type
   * for the "Who" column. Fire-and-forget — call with `void`. Use this from
   * service-level money/security instrumentation where you have the actor's id
   * but not their name (e.g. webhooks, crons, ledger movements).
   */
  async recordWithActor(
    actorUserId: string | null,
    event: Omit<RecordAuditInput, 'actorId' | 'actorName' | 'actorType'> & { actorType?: string },
  ): Promise<void> {
    let actorName: string | null = null;
    let actorType = event.actorType ?? 'system';
    if (actorUserId) {
      try {
        const u = await this.users.findOne({ where: { id: actorUserId }, select: ['id', 'fullName', 'roles'] });
        if (u) {
          actorName = u.fullName;
          if (!event.actorType) actorType = primaryActorType(u.roles as unknown as string[]);
        }
      } catch { /* name is best-effort */ }
    }
    this.record({ ...event, actorId: actorUserId, actorName, actorType });
  }

  /**
   * Persist one audit row. Fire-and-forget: never throws into the caller and
   * never blocks the request that triggered it.
   */
  record(input: RecordAuditInput): void {
    const row = this.repo.create({
      app: input.app ?? 'api',
      category: input.category,
      action: input.action,
      description: input.description,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? 'system',
      actorName: input.actorName ?? null,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      method: input.method ?? null,
      path: input.path ?? null,
      statusCode: input.statusCode ?? null,
      success: input.success ?? true,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
    this.repo.save(row).catch((err) => this.logger.warn(`audit write failed: ${err?.message ?? err}`));
  }

  /** Admin: query the audit trail with every filter. */
  async query(q: AuditQuery) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 25));

    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC');

    if (q.app) qb.andWhere('a.app = :app', { app: q.app });
    if (q.category) qb.andWhere('a.category = :category', { category: q.category });
    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    if (q.actorType) qb.andWhere('a.actorType = :actorType', { actorType: q.actorType });
    if (q.actorId) qb.andWhere('a.actorId = :actorId', { actorId: q.actorId });
    if (q.targetId) qb.andWhere('a.targetId = :targetId', { targetId: q.targetId });
    if (q.success != null) qb.andWhere('a.success = :success', { success: q.success });
    if (q.from) qb.andWhere('a.createdAt >= :from', { from: new Date(q.from) });
    if (q.to) qb.andWhere('a.createdAt <= :to', { to: new Date(q.to) });
    if (q.search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('a.description ILIKE :q', { q: `%${q.search}%` })
            .orWhere('a.actorName ILIKE :q', { q: `%${q.search}%` })
            .orWhere('a.targetLabel ILIKE :q', { q: `%${q.search}%` })
            .orWhere('a.targetId ILIKE :q', { q: `%${q.search}%` })
            .orWhere('CAST(a.actorId AS TEXT) ILIKE :q', { q: `%${q.search}%` });
        }),
      );
    }

    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /** Distinct values that power the filter dropdowns. */
  async filterOptions() {
    const distinct = async (col: string) => {
      const rows = await this.repo
        .createQueryBuilder('a')
        .select(`DISTINCT a.${col}`, 'v')
        .where(`a.${col} IS NOT NULL`)
        .orderBy('v', 'ASC')
        .getRawMany<{ v: string }>();
      return rows.map((r) => r.v).filter(Boolean);
    };
    const [apps, categories, actions, actorTypes] = await Promise.all([
      distinct('app'),
      distinct('category'),
      distinct('action'),
      distinct('actorType'),
    ]);
    return { apps, categories, actions, actorTypes };
  }
}
