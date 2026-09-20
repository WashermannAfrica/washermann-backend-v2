import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import * as mammoth from 'mammoth';
import { Policy } from '../../database/entities/policy.entity';
import { PolicyVersion } from '../../database/entities/policy-version.entity';
import { PolicyAcceptance } from '../../database/entities/policy-acceptance.entity';
import {
  CreatePolicyDto, UpdatePolicyDto, CreateVersionDto, UpdateVersionDto,
} from './dto/policy.dto';

@Injectable()
export class PoliciesService {
  constructor(
    @InjectRepository(Policy) private readonly policies: Repository<Policy>,
    @InjectRepository(PolicyVersion) private readonly versions: Repository<PolicyVersion>,
    @InjectRepository(PolicyAcceptance) private readonly acceptances: Repository<PolicyAcceptance>,
  ) {}

  // ─── Rendering ────────────────────────────────────────────────────────────────
  /** Markdown (canonical) → sanitized HTML + SHA-256 of the source. */
  private render(markdown: string): { html: string; hash: string } {
    const raw = marked.parse(markdown, { async: false }) as string;
    const html = sanitizeHtml(raw, {
      allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'blockquote',
        'strong', 'em', 'code', 'pre', 'hr', 'br', 'span', 'div',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        '*': ['id'],
      },
      transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
      },
    });
    const hash = createHash('sha256').update(markdown, 'utf8').digest('hex');
    return { html, hash };
  }

  // ─── Public read ──────────────────────────────────────────────────────────────
  async listPublic() {
    const rows = await this.policies.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', title: 'ASC' },
    });
    return rows
      .filter((p) => p.currentVersionId)
      .map((p) => ({ key: p.key, title: p.title, description: p.description, audiences: p.audiences }));
  }

  async getPublic(key: string) {
    const policy = await this.policies.findOne({ where: { key, isActive: true } });
    if (!policy || !policy.currentVersionId) throw new NotFoundException('Policy not found');
    const version = await this.versions.findOne({ where: { id: policy.currentVersionId } });
    if (!version) throw new NotFoundException('Policy not found');
    return this.publicShape(policy, version);
  }

  async getPublicVersion(key: string, versionNumber: number) {
    const policy = await this.policies.findOne({ where: { key } });
    if (!policy) throw new NotFoundException('Policy not found');
    const version = await this.versions.findOne({
      where: { policyId: policy.id, versionNumber, status: 'published' },
    });
    if (!version && !(await this.versions.findOne({ where: { policyId: policy.id, versionNumber, status: 'archived' } })))
      throw new NotFoundException('Policy version not found');
    const v = version ?? (await this.versions.findOne({ where: { policyId: policy.id, versionNumber } }))!;
    return this.publicShape(policy, v);
  }

  private publicShape(policy: Policy, v: PolicyVersion) {
    return {
      key: policy.key,
      title: policy.title,
      versionNumber: v.versionNumber,
      effectiveDate: v.effectiveDate,
      contentHtml: v.contentHtml,
      contentHash: v.contentHash,
    };
  }

  // ─── Admin: policies ──────────────────────────────────────────────────────────
  async adminList() {
    const policies = await this.policies.find({ order: { sortOrder: 'ASC', title: 'ASC' } });
    const counts = await this.versions
      .createQueryBuilder('v')
      .select('v.policy_id', 'policyId')
      .addSelect('COUNT(*)', 'total')
      .groupBy('v.policy_id')
      .getRawMany<{ policyId: string; total: string }>();
    const byId = new Map(counts.map((c) => [c.policyId, Number(c.total)]));
    return policies.map((p) => ({ ...p, versionCount: byId.get(p.id) ?? 0 }));
  }

  async adminCreatePolicy(dto: CreatePolicyDto) {
    const existing = await this.policies.findOne({ where: { key: dto.key } });
    if (existing) throw new BadRequestException(`A policy with key "${dto.key}" already exists`);
    const policy = this.policies.create({
      key: dto.key,
      title: dto.title,
      description: dto.description ?? null,
      audiences: dto.audiences ?? [],
      sortOrder: dto.sortOrder ?? 0,
      isActive: true,
      currentVersionId: null,
    });
    return this.policies.save(policy);
  }

  async adminGetOne(id: string) {
    const policy = await this.mustFindPolicy(id);
    const versions = await this.versions.find({
      where: { policyId: id },
      order: { versionNumber: 'DESC' },
    });
    const counts = await this.acceptances
      .createQueryBuilder('a')
      .select('a.version_id', 'versionId')
      .addSelect('COUNT(*)', 'count')
      .where('a.policy_id = :id', { id })
      .groupBy('a.version_id')
      .getRawMany<{ versionId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.versionId, Number(c.count)]));
    return {
      ...policy,
      versions: versions.map((v) => ({ ...v, acceptanceCount: byId.get(v.id) ?? 0 })),
    };
  }

  async adminUpdatePolicy(id: string, dto: UpdatePolicyDto) {
    const policy = await this.policies.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    Object.assign(policy, {
      title: dto.title ?? policy.title,
      description: dto.description ?? policy.description,
      audiences: dto.audiences ?? policy.audiences,
      sortOrder: dto.sortOrder ?? policy.sortOrder,
      isActive: dto.isActive ?? policy.isActive,
    });
    return this.policies.save(policy);
  }

  // ─── Admin: versions ──────────────────────────────────────────────────────────
  async adminListVersions(policyId: string) {
    await this.mustFindPolicy(policyId);
    return this.versions.find({ where: { policyId }, order: { versionNumber: 'DESC' } });
  }

  async adminCreateVersion(policyId: string, dto: CreateVersionDto) {
    await this.mustFindPolicy(policyId);
    return this.persistNewDraft(policyId, dto.contentMarkdown, {
      effectiveDate: dto.effectiveDate,
      changeSummary: dto.changeSummary ?? null,
      requiresReconsent: dto.requiresReconsent ?? false,
      sourceFormat: dto.sourceFormat ?? 'markdown',
    });
  }

  /** Create a draft version from an uploaded .docx (converted to Markdown, then editable). */
  async adminCreateVersionFromDocx(
    policyId: string,
    buffer: Buffer,
    opts: { effectiveDate?: string; changeSummary?: string } = {},
  ) {
    await this.mustFindPolicy(policyId);
    const markdown = await this.docxToMarkdown(buffer);
    if (!markdown) throw new BadRequestException('Could not extract any text from that document');
    return this.persistNewDraft(policyId, markdown, {
      effectiveDate: opts.effectiveDate ?? new Date().toISOString().slice(0, 10),
      changeSummary: opts.changeSummary ?? 'Imported from uploaded .docx',
      requiresReconsent: false,
      sourceFormat: 'docx',
    });
  }

  private async docxToMarkdown(buffer: Buffer): Promise<string> {
    // convertToMarkdown exists at runtime but is absent from mammoth's type defs.
    const convert = (mammoth as unknown as {
      convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    }).convertToMarkdown;
    const result = await convert({ buffer });
    return this.cleanImportedMarkdown(result.value ?? '');
  }

  /**
   * Strip embedded images (Word inlines logos as huge base64 data URIs, and the site
   * template supplies branding anyway) and normalise whitespace from a docx import.
   */
  private cleanImportedMarkdown(markdown: string): string {
    return markdown
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // markdown images, incl. data: URIs
      .replace(/[ \t]+$/gm, '')             // trailing spaces
      .replace(/\n{3,}/g, '\n\n')           // collapse blank runs
      .trim();
  }

  private async persistNewDraft(
    policyId: string,
    markdown: string,
    opts: { effectiveDate: string; changeSummary?: string | null; requiresReconsent?: boolean; sourceFormat?: string },
  ) {
    const last = await this.versions.findOne({
      where: { policyId },
      order: { versionNumber: 'DESC' },
    });
    const { html, hash } = this.render(markdown);
    const version = this.versions.create({
      policyId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      status: 'draft',
      contentMarkdown: markdown,
      contentHtml: html,
      contentHash: hash,
      changeSummary: opts.changeSummary ?? null,
      effectiveDate: opts.effectiveDate,
      requiresReconsent: opts.requiresReconsent ?? false,
      sourceFormat: opts.sourceFormat ?? 'markdown',
      publishedAt: null,
      publishedByUserId: null,
    });
    return this.versions.save(version);
  }

  /** Draft versions only — published versions are immutable. */
  async adminUpdateVersion(policyId: string, versionNumber: number, dto: UpdateVersionDto) {
    const version = await this.mustFindVersion(policyId, versionNumber);
    if (version.status !== 'draft')
      throw new BadRequestException('Only draft versions can be edited; create a new version instead');
    if (dto.contentMarkdown !== undefined) {
      const { html, hash } = this.render(dto.contentMarkdown);
      version.contentMarkdown = dto.contentMarkdown;
      version.contentHtml = html;
      version.contentHash = hash;
    }
    if (dto.effectiveDate !== undefined) version.effectiveDate = dto.effectiveDate;
    if (dto.changeSummary !== undefined) version.changeSummary = dto.changeSummary;
    if (dto.requiresReconsent !== undefined) version.requiresReconsent = dto.requiresReconsent;
    return this.versions.save(version);
  }

  async adminPublishVersion(policyId: string, versionNumber: number, userId: string) {
    const policy = await this.mustFindPolicy(policyId);
    const version = await this.mustFindVersion(policyId, versionNumber);
    if (version.status === 'published') return version;

    // Archive whatever is currently published for this policy.
    await this.versions.update(
      { policyId, status: 'published' },
      { status: 'archived' },
    );

    version.status = 'published';
    version.publishedAt = new Date();
    version.publishedByUserId = userId;
    const saved = await this.versions.save(version);

    policy.currentVersionId = saved.id;
    await this.policies.save(policy);
    return saved;
  }

  // ─── helpers ──────────────────────────────────────────────────────────────────
  private async mustFindPolicy(id: string): Promise<Policy> {
    const policy = await this.policies.findOne({ where: { id } });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  private async mustFindVersion(policyId: string, versionNumber: number): Promise<PolicyVersion> {
    const version = await this.versions.findOne({ where: { policyId, versionNumber } });
    if (!version) throw new NotFoundException('Policy version not found');
    return version;
  }
}
