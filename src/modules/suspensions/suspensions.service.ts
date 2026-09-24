import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuspensionNotice, SuspensionSubjectType } from '../../database/entities/suspension-notice.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { VendorsService } from '../vendors/vendors.service';
import { RepsService } from '../reps/reps.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { RepStatus } from '../../common/enums/rep-status.enum';

interface IssueDto { subjectType: SuspensionSubjectType; subjectId: string; reason: string }

@Injectable()
export class SuspensionsService {
  private readonly logger = new Logger(SuspensionsService.name);

  constructor(
    @InjectRepository(SuspensionNotice) private notices: Repository<SuspensionNotice>,
    @InjectRepository(Vendor) private vendors: Repository<Vendor>,
    @InjectRepository(Rep) private reps: Repository<Rep>,
    private vendorsService: VendorsService,
    private repsService: RepsService,
    private platformConfigService: PlatformConfigService,
    private notificationsService: NotificationsService,
  ) {}

  private addBusinessDays(from: Date, days: number): Date {
    const d = new Date(from);
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return d;
  }

  /** Resolve the subject's user id (and assert it exists). */
  private async subjectUserId(type: SuspensionSubjectType, id: string): Promise<string> {
    if (type === 'vendor') {
      const v = await this.vendors.findOne({ where: { id } });
      if (!v) throw new NotFoundException('Vendor not found');
      return v.userId;
    }
    const r = await this.reps.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Rep not found');
    return r.userId;
  }

  private async applySuspend(type: SuspensionSubjectType, id: string, reason?: string) {
    if (type === 'vendor') {
      await this.vendorsService.updateVerificationStatus(id, VendorVerificationStatus.SUSPENDED, reason);
    } else {
      await this.repsService.update(id, { status: RepStatus.SUSPENDED });
    }
  }

  private async applyReactivate(type: SuspensionSubjectType, id: string) {
    if (type === 'vendor') {
      await this.vendorsService.updateVerificationStatus(id, VendorVerificationStatus.VERIFIED);
    } else {
      await this.repsService.update(id, { status: RepStatus.ACTIVE });
    }
  }

  // ─── Admin actions ────────────────────────────────────────────────────────────

  /** Issue a suspension NOTICE (no suspension yet) with a response window. */
  async issueNotice(dto: IssueDto, adminId: string) {
    if (!dto.reason?.trim()) throw new BadRequestException('A reason is required');
    const subjectUserId = await this.subjectUserId(dto.subjectType, dto.subjectId);
    const config = await this.platformConfigService.getConfig();
    const notice = await this.notices.save(this.notices.create({
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      subjectUserId,
      reason: dto.reason.trim().slice(0, 1000),
      status: 'notice',
      immediate: false,
      respondBy: this.addBusinessDays(new Date(), config.suspensionNoticeDays ?? 7),
      createdBy: adminId,
    }));
    this.notificationsService.notifySuspensionNotice(subjectUserId, {
      reason: notice.reason,
      respondBy: notice.respondBy!,
      noticeId: notice.id,
    });
    return notice;
  }

  /** Immediate suspension for fraud/safety — bypasses the response window. */
  async immediateSuspend(dto: IssueDto, adminId: string) {
    if (!dto.reason?.trim()) throw new BadRequestException('A reason is required');
    const subjectUserId = await this.subjectUserId(dto.subjectType, dto.subjectId);
    await this.applySuspend(dto.subjectType, dto.subjectId, dto.reason.trim());
    const notice = await this.notices.save(this.notices.create({
      subjectType: dto.subjectType,
      subjectId: dto.subjectId,
      subjectUserId,
      reason: dto.reason.trim().slice(0, 1000),
      status: 'suspended',
      immediate: true,
      suspendedAt: new Date(),
      createdBy: adminId,
    }));
    this.notificationsService.notifySuspensionEnforced(subjectUserId, {
      reason: notice.reason, immediate: true, noticeId: notice.id,
    });
    return notice;
  }

  /** Withdraw a notice before it is enforced (no suspension). */
  async withdraw(noticeId: string, adminId: string) {
    const notice = await this.mustFind(noticeId);
    if (notice.status !== 'notice') throw new BadRequestException('Only an open notice can be withdrawn');
    notice.status = 'withdrawn';
    notice.reviewedBy = adminId;
    return this.notices.save(notice);
  }

  /** Enforce a notice — suspends the subject. */
  async enforce(noticeId: string, adminId: string) {
    const notice = await this.mustFind(noticeId);
    if (notice.status !== 'notice') throw new BadRequestException('Only an open notice can be enforced');
    await this.applySuspend(notice.subjectType, notice.subjectId, notice.reason);
    notice.status = 'suspended';
    notice.suspendedAt = new Date();
    const saved = await this.notices.save(notice);
    this.notificationsService.notifySuspensionEnforced(notice.subjectUserId, {
      reason: notice.reason, immediate: false, noticeId: notice.id,
    });
    return saved;
  }

  /** Decide an internal review: uphold (stays suspended) or overturn (reinstate). */
  async decideReview(noticeId: string, adminId: string, decision: 'upheld' | 'overturned', note?: string) {
    const notice = await this.mustFind(noticeId);
    if (notice.status !== 'under_review') throw new BadRequestException('This notice is not under review');
    notice.reviewDecision = decision;
    notice.reviewDecidedAt = new Date();
    notice.reviewedBy = adminId;
    if (note) notice.reviewNote = `${notice.reviewNote ?? ''}\n[decision] ${note}`.trim().slice(0, 1000);
    if (decision === 'overturned') {
      await this.applyReactivate(notice.subjectType, notice.subjectId);
      notice.status = 'reinstated';
    } else {
      notice.status = 'suspended';
    }
    const saved = await this.notices.save(notice);
    this.notificationsService.notifySuspensionReviewDecided(notice.subjectUserId, {
      decision, noticeId: notice.id,
    });
    return saved;
  }

  // ─── Subject (vendor/rep) actions ───────────────────────────────────────────────

  /** Subject responds/remedies during the notice window. */
  async respond(noticeId: string, userId: string, response: string) {
    const notice = await this.mustFind(noticeId);
    if (notice.subjectUserId !== userId) throw new ForbiddenException('Not your notice');
    if (notice.status !== 'notice') throw new BadRequestException('This notice can no longer be responded to');
    notice.response = (response ?? '').slice(0, 1000);
    notice.respondedAt = new Date();
    return this.notices.save(notice);
  }

  /** Suspended subject requests an internal review. */
  async requestReview(noticeId: string, userId: string, note?: string) {
    const notice = await this.mustFind(noticeId);
    if (notice.subjectUserId !== userId) throw new ForbiddenException('Not your notice');
    if (notice.status !== 'suspended') throw new BadRequestException('Only a suspension can be reviewed');
    notice.status = 'under_review';
    notice.reviewRequestedAt = new Date();
    notice.reviewNote = (note ?? '').slice(0, 1000) || null;
    return this.notices.save(notice);
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────--

  list(filter: { subjectType?: string; subjectId?: string; status?: string } = {}) {
    const where: Record<string, unknown> = {};
    if (filter.subjectType) where.subjectType = filter.subjectType;
    if (filter.subjectId) where.subjectId = filter.subjectId;
    if (filter.status) where.status = filter.status;
    return this.notices.find({ where, order: { createdAt: 'DESC' } });
  }

  listMine(userId: string) {
    return this.notices.find({ where: { subjectUserId: userId }, order: { createdAt: 'DESC' } });
  }

  private async mustFind(id: string): Promise<SuspensionNotice> {
    const n = await this.notices.findOne({ where: { id } });
    if (!n) throw new NotFoundException('Suspension notice not found');
    return n;
  }
}
