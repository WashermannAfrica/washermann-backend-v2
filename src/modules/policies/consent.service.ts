import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Policy } from '../../database/entities/policy.entity';
import { PolicyVersion } from '../../database/entities/policy-version.entity';
import { PolicyAcceptance, ConsentMethod } from '../../database/entities/policy-acceptance.entity';

/** Maps a user's platform roles to the policy "audiences" admins tag policies with. */
const ROLE_AUDIENCE: Record<string, string> = {
  user: 'customer',
  vendor: 'vendor',
  washerman: 'rep',
  rep: 'rep',
  sales_rep: 'sales_rep',
  company_owner: 'company',
  company_admin: 'company',
  team_owner: 'company',
  team_admin: 'company',
};

export interface PendingPolicy {
  key: string;
  title: string;
  versionNumber: number;
  effectiveDate: string;
  requiresReconsent: boolean;
  reason: 'new' | 'updated';
}

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(Policy) private readonly policies: Repository<Policy>,
    @InjectRepository(PolicyVersion) private readonly versions: Repository<PolicyVersion>,
    @InjectRepository(PolicyAcceptance) private readonly acceptances: Repository<PolicyAcceptance>,
  ) {}

  audiencesForRoles(roles: string[] = []): string[] {
    const set = new Set<string>();
    for (const r of roles) if (ROLE_AUDIENCE[r]) set.add(ROLE_AUDIENCE[r]);
    return [...set];
  }

  /** Active policies (with a live version) this audience must accept. */
  private async requiredPolicies(audiences: string[]): Promise<Policy[]> {
    const all = await this.policies.find({ where: { isActive: true } });
    return all.filter(
      (p) => !!p.currentVersionId &&
        p.audiences?.some((a) => a === 'all' || audiences.includes(a)),
    );
  }

  /** Policies the user still needs to accept (never accepted, or an update requiring re-consent). */
  async getPending(userId: string, roles: string[]): Promise<PendingPolicy[]> {
    const audiences = this.audiencesForRoles(roles);
    const required = await this.requiredPolicies(audiences);
    if (required.length === 0) return [];

    const currentVersions = await this.versions.find({
      where: { id: In(required.map((p) => p.currentVersionId as string)) },
    });
    const versionById = new Map(currentVersions.map((v) => [v.id, v]));

    const mine = await this.acceptances.find({ where: { userId } });
    const acceptedVersionIds = new Set(mine.map((a) => a.versionId));
    const acceptedKeys = new Set(mine.map((a) => a.policyKey));

    const pending: PendingPolicy[] = [];
    for (const p of required) {
      const v = versionById.get(p.currentVersionId as string);
      if (!v) continue;
      if (acceptedVersionIds.has(v.id)) continue; // already on the current version

      const everAccepted = acceptedKeys.has(p.key);
      // A newer version that does NOT require re-consent leaves prior consent valid.
      if (everAccepted && !v.requiresReconsent) continue;

      pending.push({
        key: p.key,
        title: p.title,
        versionNumber: v.versionNumber,
        effectiveDate: v.effectiveDate,
        requiresReconsent: v.requiresReconsent,
        reason: everAccepted ? 'updated' : 'new',
      });
    }
    return pending;
  }

  /**
   * Record acceptance of the current published version of each key (idempotent per
   * version). If `keys` is omitted, accepts everything currently pending for the user.
   */
  async accept(
    userId: string,
    roles: string[],
    keys: string[] | undefined,
    method: ConsentMethod,
    ctx: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<{ recorded: number; keys: string[] }> {
    let targetKeys = keys;
    if (!targetKeys || targetKeys.length === 0) {
      targetKeys = (await this.getPending(userId, roles)).map((p) => p.key);
    }
    if (targetKeys.length === 0) return { recorded: 0, keys: [] };

    const policies = await this.policies.find({ where: { key: In(targetKeys) } });
    const byKey = new Map(policies.map((p) => [p.key, p]));

    const recorded: string[] = [];
    for (const key of targetKeys) {
      const policy = byKey.get(key);
      if (!policy || !policy.currentVersionId) {
        throw new BadRequestException(`Policy "${key}" is not published`);
      }
      const version = await this.versions.findOne({ where: { id: policy.currentVersionId } });
      if (!version) throw new BadRequestException(`Policy "${key}" is not published`);

      const already = await this.acceptances.findOne({ where: { userId, versionId: version.id } });
      if (already) { recorded.push(key); continue; } // idempotent

      await this.acceptances.save(this.acceptances.create({
        userId,
        policyId: policy.id,
        policyKey: policy.key,
        versionId: version.id,
        versionNumber: version.versionNumber,
        contentHash: version.contentHash,
        method,
        ipAddress: ctx.ip ?? null,
        userAgent: (ctx.userAgent ?? '').slice(0, 300) || null,
      }));
      recorded.push(key);
    }
    return { recorded: recorded.length, keys: recorded };
  }

  /** A user's own acceptance history (evidence trail). */
  async history(userId: string) {
    return this.acceptances.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
