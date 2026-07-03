import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { BlogPost, BlogPostStatus, BlogPublishedSnapshot } from '../../database/entities/blog-post.entity';
import { User } from '../../database/entities/user.entity';
import { slugify } from '../catalogue/catalogue-seed';
import { CreateBlogPostDto, UpdateBlogPostDto } from './dto/blog.dto';
import { NotificationsService } from '../notifications/notifications.service';

/** Tags/attributes the editor is allowed to produce. Everything else is stripped. */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h2', 'h3', 'h4', 'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'code', 'pre', 'mark',
    'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['https', 'http', 'mailto'],
  transformTags: {
    // External links open safely in a new tab
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
};

const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface PublicBlogCard {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  tags: string[];
  readingTimeMins: number;
  publishedAt: Date;
  author: { name: string; avatarUrl: string | null };
}

@Injectable()
export class BlogService {
  private readonly logger = new Logger(BlogService.name);

  constructor(
    @InjectRepository(BlogPost)
    private postRepository: Repository<BlogPost>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    private configService: ConfigService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private sanitize(html: string): string {
    return sanitizeHtml(html ?? '', SANITIZE_OPTIONS);
  }

  private readingTime(html: string): number {
    const words = this.sanitize(html).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base || 'post';
    let n = 1;
    for (;;) {
      const clash = await this.postRepository.findOne({ where: { slug } });
      if (!clash || clash.id === excludeId) return slug;
      slug = `${base}-${++n}`;
    }
  }

  private async author(userId: string): Promise<{ name: string; avatarUrl: string | null }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return { name: user?.fullName ?? 'Washermann Team', avatarUrl: user?.avatarUrl ?? null };
  }

  /**
   * Ask the landing site to regenerate /blog and the post page immediately
   * (publishes shouldn't wait out the ISR window). Fire-and-forget — a dead
   * landing site must never fail the admin action.
   */
  private pingRevalidate(slug: string) {
    const base = this.configService.get<string>('app.landingUrl');
    const secret = this.configService.get<string>('app.landingRevalidateSecret');
    if (!base || !secret) return;
    fetch(`${base.replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, slug }),
    }).catch((e) => this.logger.warn(`Landing revalidate ping failed: ${e.message}`));
  }

  private async findOne(id: string): Promise<BlogPost> {
    const post = await this.postRepository.findOne({ where: { id } });
    if (!post) throw new NotFoundException('Blog post not found');
    return post;
  }

  // ─── Admin: CRUD on the draft copy ───────────────────────────────────────────

  async create(dto: CreateBlogPostDto, adminId: string): Promise<BlogPost> {
    const post = this.postRepository.create({
      slug: await this.uniqueSlug(slugify(dto.title)),
      title: dto.title.trim(),
      excerpt: dto.excerpt?.trim() ?? '',
      coverImageUrl: dto.coverImageUrl ?? null,
      bodyHtml: this.sanitize(dto.bodyHtml ?? ''),
      tags: (dto.tags ?? []).map((t) => slugify(t)).filter(Boolean),
      seoTitle: dto.seoTitle?.trim() || null,
      seoDescription: dto.seoDescription?.trim() || null,
      readingTimeMins: this.readingTime(dto.bodyHtml ?? ''),
      status: BlogPostStatus.DRAFT,
      authorUserId: adminId,
      updatedBy: adminId,
      viewCount: 0,
    });
    return this.postRepository.save(post);
  }

  async update(id: string, dto: UpdateBlogPostDto, adminId: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    if (post.status === BlogPostStatus.IN_REVIEW) {
      throw new BadRequestException('Post is in review — approve it or request changes before editing');
    }

    if (dto.slug !== undefined && dto.slug !== post.slug) {
      if (post.firstPublishedAt) {
        throw new BadRequestException('Slug is locked after first publish (existing links must keep working)');
      }
      post.slug = await this.uniqueSlug(slugify(dto.slug), post.id);
    }
    if (dto.title !== undefined) post.title = dto.title.trim();
    if (dto.excerpt !== undefined) post.excerpt = dto.excerpt.trim();
    if (dto.coverImageUrl !== undefined) post.coverImageUrl = dto.coverImageUrl || null;
    if (dto.bodyHtml !== undefined) {
      post.bodyHtml = this.sanitize(dto.bodyHtml);
      post.readingTimeMins = this.readingTime(dto.bodyHtml);
    }
    if (dto.tags !== undefined) post.tags = dto.tags.map((t) => slugify(t)).filter(Boolean);
    if (dto.seoTitle !== undefined) post.seoTitle = dto.seoTitle?.trim() || null;
    if (dto.seoDescription !== undefined) post.seoDescription = dto.seoDescription?.trim() || null;

    // Editing a clean published post reopens the draft workflow
    if (post.status === BlogPostStatus.PUBLISHED) post.status = BlogPostStatus.DRAFT;
    post.updatedBy = adminId;
    return this.postRepository.save(post);
  }

  async adminList(query: { status?: BlogPostStatus; page?: number; limit?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const qb = this.postRepository
      .createQueryBuilder('p')
      .orderBy('p.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.status) qb.andWhere('p.status = :s', { s: query.status });
    const [rows, total] = await qb.getManyAndCount();

    // Attach author identities for the list
    const authorIds = [...new Set(rows.map((r) => r.authorUserId))];
    const users = authorIds.length
      ? await this.userRepository.find({ where: { id: In(authorIds) }, select: ['id', 'fullName'] })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    const data = rows.map((r) => ({ ...r, authorName: nameById.get(r.authorUserId) ?? 'Unknown' }));
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async adminGet(id: string) {
    const post = await this.findOne(id);
    return { ...post, author: await this.author(post.authorUserId) };
  }

  async remove(id: string): Promise<void> {
    const post = await this.findOne(id);
    if (post.firstPublishedAt) {
      throw new BadRequestException('Published posts cannot be deleted — archive instead');
    }
    await this.postRepository.remove(post);
  }

  // ─── Workflow: submit → approve / request changes; archive ──────────────────

  async submit(id: string, adminId: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    if (post.status !== BlogPostStatus.DRAFT && post.status !== BlogPostStatus.PUBLISHED) {
      throw new BadRequestException(`Cannot submit a post in status "${post.status}"`);
    }
    if (!post.title.trim() || !this.sanitize(post.bodyHtml).replace(/<[^>]+>/g, '').trim()) {
      throw new BadRequestException('Post needs a title and body before review');
    }
    post.status = BlogPostStatus.IN_REVIEW;
    post.submittedAt = new Date();
    post.submittedBy = adminId;
    post.reviewNote = null;
    const saved = await this.postRepository.save(post);

    const author = await this.author(post.authorUserId);
    this.notificationsService.notifyBlogSubmitted({
      postId: post.id,
      title: post.title,
      authorName: author.name,
      excludeUserId: adminId, // don't notify the submitter about their own submission
    });
    return saved;
  }

  /**
   * Four-eyes approval: the reviewer must be a DIFFERENT admin than both the
   * post's author and whoever submitted it. Copies the draft into the
   * published snapshot — this is the only way content reaches the public site.
   */
  async approve(id: string, reviewerId: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    if (post.status !== BlogPostStatus.IN_REVIEW) {
      throw new BadRequestException('Only posts in review can be approved');
    }
    if (reviewerId === post.authorUserId || reviewerId === post.submittedBy) {
      throw new ForbiddenException('You cannot approve your own post — a different admin must review it');
    }

    const snapshot: BlogPublishedSnapshot = {
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      bodyHtml: post.bodyHtml,
      tags: post.tags,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      readingTimeMins: post.readingTimeMins,
    };
    post.publishedSnapshot = snapshot;
    post.publishedAt = new Date();
    post.firstPublishedAt = post.firstPublishedAt ?? post.publishedAt;
    post.status = BlogPostStatus.PUBLISHED;
    post.reviewedBy = reviewerId;
    post.reviewNote = null;
    const saved = await this.postRepository.save(post);
    this.pingRevalidate(post.slug);

    this.notificationsService.notifyBlogReviewDecision({
      postId: post.id,
      title: post.title,
      slug: post.slug,
      authorUserId: post.authorUserId,
      approved: true,
      note: null,
    });
    return saved;
  }

  async requestChanges(id: string, reviewerId: string, note: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    if (post.status !== BlogPostStatus.IN_REVIEW) {
      throw new BadRequestException('Only posts in review can have changes requested');
    }
    if (reviewerId === post.authorUserId || reviewerId === post.submittedBy) {
      throw new ForbiddenException('You cannot review your own post — a different admin must review it');
    }
    post.status = BlogPostStatus.DRAFT;
    post.reviewedBy = reviewerId;
    post.reviewNote = note.trim();
    const saved = await this.postRepository.save(post);

    this.notificationsService.notifyBlogReviewDecision({
      postId: post.id,
      title: post.title,
      slug: post.slug,
      authorUserId: post.authorUserId,
      approved: false,
      note: post.reviewNote,
    });
    return saved;
  }

  async archive(id: string, adminId: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    post.status = BlogPostStatus.ARCHIVED;
    post.updatedBy = adminId;
    const saved = await this.postRepository.save(post);
    this.pingRevalidate(post.slug);
    return saved;
  }

  async unarchive(id: string, adminId: string): Promise<BlogPost> {
    const post = await this.findOne(id);
    if (post.status !== BlogPostStatus.ARCHIVED) throw new BadRequestException('Post is not archived');
    // Back to published if a live snapshot exists, else back to draft
    post.status = post.publishedSnapshot ? BlogPostStatus.PUBLISHED : BlogPostStatus.DRAFT;
    post.updatedBy = adminId;
    const saved = await this.postRepository.save(post);
    this.pingRevalidate(post.slug);
    return saved;
  }

  // ─── Public: what the landing serves ─────────────────────────────────────────

  /** Published, non-archived cards, newest first. */
  async publicList(query: { page?: number; limit?: number; tag?: string }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(50, Math.max(1, query.limit ?? 12));
    const qb = this.postRepository
      .createQueryBuilder('p')
      .where('p.publishedSnapshot IS NOT NULL')
      .andWhere('p.status != :archived', { archived: BlogPostStatus.ARCHIVED })
      .orderBy('p.firstPublishedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.tag) {
      qb.andWhere(`p.published_snapshot->'tags' @> :tag::jsonb`, { tag: JSON.stringify([slugify(query.tag)]) });
    }
    const [rows, total] = await qb.getManyAndCount();

    const cards: PublicBlogCard[] = [];
    for (const row of rows) {
      const s = row.publishedSnapshot!;
      cards.push({
        slug: row.slug,
        title: s.title,
        excerpt: s.excerpt,
        coverImageUrl: s.coverImageUrl,
        tags: s.tags,
        readingTimeMins: s.readingTimeMins,
        publishedAt: row.firstPublishedAt!,
        author: await this.author(row.authorUserId),
      });
    }
    return { data: cards, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  /** Full published post by slug. Bumps view count fire-and-forget. */
  async publicGet(slug: string) {
    const post = await this.postRepository.findOne({ where: { slug } });
    if (!post || !post.publishedSnapshot || post.status === BlogPostStatus.ARCHIVED) {
      throw new NotFoundException('Blog post not found');
    }
    this.postRepository
      .increment({ id: post.id }, 'viewCount', 1)
      .catch((e) => this.logger.warn(`view count bump failed: ${e.message}`));

    const s = post.publishedSnapshot;
    return {
      slug: post.slug,
      title: s.title,
      excerpt: s.excerpt,
      coverImageUrl: s.coverImageUrl,
      bodyHtml: s.bodyHtml,
      tags: s.tags,
      seoTitle: s.seoTitle,
      seoDescription: s.seoDescription,
      readingTimeMins: s.readingTimeMins,
      publishedAt: post.firstPublishedAt,
      updatedAt: post.publishedAt,
      author: await this.author(post.authorUserId),
    };
  }

  /** Up to 3 other published posts sharing a tag (for "more like this"). */
  async related(slug: string) {
    const post = await this.postRepository.findOne({ where: { slug } });
    const tags = post?.publishedSnapshot?.tags ?? [];
    if (!post || tags.length === 0) return [];
    const rows = await this.postRepository
      .createQueryBuilder('p')
      .where('p.publishedSnapshot IS NOT NULL')
      .andWhere('p.status != :archived', { archived: BlogPostStatus.ARCHIVED })
      .andWhere('p.id != :id', { id: post.id })
      .andWhere(`p.published_snapshot->'tags' ?| array[:...tags]`, { tags })
      .orderBy('p.firstPublishedAt', 'DESC')
      .take(3)
      .getMany();
    return Promise.all(
      rows.map(async (row) => {
        const s = row.publishedSnapshot!;
        return {
          slug: row.slug,
          title: s.title,
          excerpt: s.excerpt,
          coverImageUrl: s.coverImageUrl,
          readingTimeMins: s.readingTimeMins,
          publishedAt: row.firstPublishedAt,
          author: await this.author(row.authorUserId),
        };
      }),
    );
  }

  // ─── Preview (reviewer sees the DRAFT in the landing skin) ───────────────────

  private previewSecret(): string {
    return this.configService.get<string>('jwt.accessSecret') || 'washermann-preview';
  }

  /** Signed, expiring link the admin "Preview" button opens on the landing site. */
  previewToken(postId: string): { token: string; expiresAt: string } {
    const expires = Date.now() + PREVIEW_TOKEN_TTL_MS;
    const sig = createHmac('sha256', this.previewSecret()).update(`${postId}:${expires}`).digest('hex');
    return { token: `${expires}.${sig}`, expiresAt: new Date(expires).toISOString() };
  }

  /** Draft copy for the landing preview route — validates the signed token. */
  async previewGet(postId: string, token: string) {
    const [expiresStr, sig] = (token ?? '').split('.');
    const expires = Number(expiresStr);
    if (!expires || !sig || Date.now() > expires) {
      throw new ForbiddenException('Preview link is invalid or has expired');
    }
    const expected = createHmac('sha256', this.previewSecret()).update(`${postId}:${expires}`).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Preview link is invalid or has expired');
    }

    const post = await this.findOne(postId);
    return {
      preview: true,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      bodyHtml: post.bodyHtml,
      tags: post.tags,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      readingTimeMins: post.readingTimeMins,
      publishedAt: post.firstPublishedAt ?? post.updatedAt,
      updatedAt: post.updatedAt,
      author: await this.author(post.authorUserId),
    };
  }
}
