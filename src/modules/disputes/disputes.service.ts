import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Dispute } from '../../database/entities/dispute.entity';
import { DisputeEvent } from '../../database/entities/dispute-event.entity';
import { Order } from '../../database/entities/order.entity';
import { DisputeStatus, OPEN_DISPUTE_STATUSES } from '../../common/enums/dispute.enum';
import { LedgerSource } from '../../common/enums/ledger-source.enum';
import { Role } from '../../common/enums/roles.enum';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto, UpdateDisputeStatusDto } from './dto/manage-dispute.dto';

const CLOSED_STATUSES = [DisputeStatus.RESOLVED, DisputeStatus.REJECTED];

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,
    @InjectRepository(DisputeEvent) private eventRepo: Repository<DisputeEvent>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    private walletsService: WalletsService,
    private notifications: NotificationsService,
  ) {}

  // ─── Customer: create ──────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateDisputeDto) {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== userId) {
      throw new ForbiddenException('You can only dispute your own orders');
    }
    // One open dispute per order keeps the queue sane.
    const existingOpen = await this.disputeRepo.findOne({
      where: { orderId: dto.orderId, status: In(OPEN_DISPUTE_STATUSES) },
    });
    if (existingOpen) {
      throw new BadRequestException(`This order already has an open dispute (${existingOpen.reference})`);
    }

    const reference = await this.generateReference();
    const dispute = await this.disputeRepo.save(
      this.disputeRepo.create({
        reference,
        orderId: dto.orderId,
        raisedByUserId: userId,
        issueType: dto.issueType,
        description: dto.description.trim(),
        affectedItems: dto.affectedItems,
        preferredResolutions: dto.preferredResolutions,
        evidenceUrls: dto.evidenceUrls ?? [],
        status: DisputeStatus.REPORTED,
      }),
    );
    await this.addEvent(dispute.id, DisputeStatus.REPORTED, 'Dispute reported by the customer.', 'customer');

    // Confirm to the customer + alert the resolver team.
    this.notifications.notifyDisputeCreated({
      userId,
      disputeRef: reference,
      orderRef: order.reference,
      issueType: dto.issueType,
    });

    return { data: await this.detailPayload(dispute.id), message: 'Dispute submitted' };
  }

  // ─── Customer: my disputes (list screen) ────────────────────────────────────────

  async listMine(userId: string, query: { status?: string; group?: string; search?: string; page?: number; limit?: number }) {
    const res = await this.runQuery({ ...query, raisedByUserId: userId });
    const counts = await this.counts({ raisedByUserId: userId });
    return { ...res, counts };
  }

  // ─── Admin/resolver: all disputes ───────────────────────────────────────────────

  async adminList(query: { status?: string; group?: string; search?: string; page?: number; limit?: number }) {
    const res = await this.runQuery(query);
    const counts = await this.counts({});
    return { ...res, counts };
  }

  // ─── Detail (owner or staff) ────────────────────────────────────────────────────

  async getOne(id: string, userId: string, roles: Role[]) {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const isStaff = roles.some((r) => [Role.ADMIN, Role.FINANCE, Role.DISPUTE_RESOLVER].includes(r));
    if (!isStaff && dispute.raisedByUserId !== userId) {
      throw new ForbiddenException('You do not have access to this dispute');
    }
    return { data: await this.detailPayload(id) };
  }

  // ─── Admin/resolver: advance status ─────────────────────────────────────────────

  async updateStatus(id: string, dto: UpdateDisputeStatusDto, actorRole: string) {
    const dispute = await this.getOpenOrFail(id);
    if (![DisputeStatus.UNDER_REVIEW, DisputeStatus.INVESTIGATING].includes(dto.status)) {
      throw new BadRequestException('Use the resolve endpoint to close a dispute');
    }
    dispute.status = dto.status;
    await this.disputeRepo.save(dispute);
    await this.addEvent(id, dto.status, dto.note ?? this.defaultNote(dto.status), actorRole);

    this.notifications.notifyDisputeUpdated({
      userId: dispute.raisedByUserId,
      disputeRef: dispute.reference,
      status: dto.status,
      note: dto.note ?? null,
    });
    return { data: await this.detailPayload(id), message: 'Dispute updated' };
  }

  // ─── Admin/resolver: resolve / reject ───────────────────────────────────────────

  async resolve(id: string, dto: ResolveDisputeDto, actorUserId: string, actorRole: string) {
    const dispute = await this.getOpenOrFail(id);
    const rejecting = dto.reject === true || !dto.outcome;

    // Optional WashPoint credit (refund / compensation).
    if (!rejecting && dto.refundWP && dto.refundWP > 0) {
      await this.walletsService.getOrCreateWallet(dispute.raisedByUserId);
      await this.walletsService.credit({
        userId: dispute.raisedByUserId,
        amount: dto.refundWP,
        source: LedgerSource.REFUND,
        description: `Dispute ${dispute.reference} resolved (${dto.outcome})`,
        reference: dispute.reference,
      });
      dispute.refundedWp = dto.refundWP;
    }

    dispute.status = rejecting ? DisputeStatus.REJECTED : DisputeStatus.RESOLVED;
    dispute.resolutionOutcome = rejecting ? 'rejected' : (dto.outcome ?? null);
    dispute.resolutionNote = dto.note?.trim() ?? null;
    dispute.resolvedByUserId = actorUserId;
    dispute.resolvedAt = new Date();
    await this.disputeRepo.save(dispute);

    const note =
      dto.note?.trim() ||
      (rejecting ? 'Dispute reviewed and closed.' : `Resolved — ${dto.outcome}${dispute.refundedWp ? ` (${dispute.refundedWp} WP credited)` : ''}.`);
    await this.addEvent(id, dispute.status, note, actorRole);

    this.notifications.notifyDisputeResolved({
      userId: dispute.raisedByUserId,
      disputeRef: dispute.reference,
      rejected: rejecting,
      outcome: dispute.resolutionOutcome,
      note: dispute.resolutionNote,
      refundedWp: dispute.refundedWp,
    });
    return { data: await this.detailPayload(id), message: rejecting ? 'Dispute rejected' : 'Dispute resolved' };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────────

  private async runQuery(query: {
    raisedByUserId?: string; status?: string; group?: string; search?: string; page?: number; limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const qb = this.disputeRepo
      .createQueryBuilder('d')
      .leftJoin(Order, 'o', 'o.id = d.order_id')
      .addSelect('o.reference', 'o_reference')
      .orderBy('d.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.raisedByUserId) qb.andWhere('d.raisedByUserId = :uid', { uid: query.raisedByUserId });
    if (query.status) qb.andWhere('d.status = :st', { st: query.status });
    else if (query.group === 'open') qb.andWhere('d.status IN (:...open)', { open: OPEN_DISPUTE_STATUSES });
    else if (query.group === 'closed') qb.andWhere('d.status IN (:...closed)', { closed: CLOSED_STATUSES });
    if (query.search) {
      qb.andWhere(new Brackets((w) => {
        w.where('d.reference ILIKE :q', { q: `%${query.search}%` })
          .orWhere('d.issueType ILIKE :q', { q: `%${query.search}%` });
      }));
    }

    const { entities, raw } = await qb.getRawAndEntities();
    const total = await qb.getCount();
    const refByIndex = new Map(entities.map((e, i) => [e.id, raw[i]?.o_reference ?? null]));
    const data = entities.map((d) => this.listItem(d, refByIndex.get(d.id) ?? null));
    return { data, meta: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  private async counts(where: { raisedByUserId?: string }) {
    const base = () => {
      const qb = this.disputeRepo.createQueryBuilder('d');
      if (where.raisedByUserId) qb.where('d.raisedByUserId = :uid', { uid: where.raisedByUserId });
      return qb;
    };
    const [total, open, investigating, closed] = await Promise.all([
      base().getCount(),
      base().andWhere('d.status IN (:...s)', { s: OPEN_DISPUTE_STATUSES }).getCount(),
      base().andWhere('d.status = :s', { s: DisputeStatus.INVESTIGATING }).getCount(),
      base().andWhere('d.status IN (:...s)', { s: CLOSED_STATUSES }).getCount(),
    ]);
    return { total, open, investigating, closed };
  }

  private listItem(d: Dispute, orderRef: string | null) {
    return {
      id: d.id,
      reference: d.reference,
      orderId: d.orderId,
      orderRef,
      issueType: d.issueType,
      status: d.status,
      affectedItems: d.affectedItems,
      createdAt: d.createdAt,
    };
  }

  private async detailPayload(id: string) {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const [order, events] = await Promise.all([
      this.orderRepo.findOne({ where: { id: dispute.orderId } }),
      this.eventRepo.find({ where: { disputeId: id }, order: { createdAt: 'ASC' } }),
    ]);
    return {
      id: dispute.id,
      reference: dispute.reference,
      orderId: dispute.orderId,
      orderRef: order?.reference ?? null,
      issueType: dispute.issueType,
      description: dispute.description,
      affectedItems: dispute.affectedItems,
      preferredResolutions: dispute.preferredResolutions,
      evidenceUrls: dispute.evidenceUrls,
      status: dispute.status,
      resolution: dispute.resolutionOutcome
        ? { outcome: dispute.resolutionOutcome, note: dispute.resolutionNote, refundedWP: dispute.refundedWp, resolvedAt: dispute.resolvedAt }
        : null,
      timeline: events.map((e) => ({ status: e.status, note: e.note, actorRole: e.actorRole, at: e.createdAt })),
      createdAt: dispute.createdAt,
    };
  }

  private addEvent(disputeId: string, status: string, note: string | null, actorRole: string) {
    return this.eventRepo.save(this.eventRepo.create({ disputeId, status, note, actorRole }));
  }

  private async getOpenOrFail(id: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (CLOSED_STATUSES.includes(dispute.status)) {
      throw new BadRequestException('This dispute is already closed');
    }
    return dispute;
  }

  private defaultNote(status: DisputeStatus): string {
    return status === DisputeStatus.UNDER_REVIEW
      ? 'Our team is reviewing your dispute.'
      : 'Your dispute is being investigated.';
  }

  private async generateReference(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const suffix = randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
      const ref = `DSP-${suffix}`;
      const exists = await this.disputeRepo.findOne({ where: { reference: ref } });
      if (!exists) return ref;
    }
    return `DSP-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }
}
