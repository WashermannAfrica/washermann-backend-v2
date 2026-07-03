import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Order } from '../../database/entities/order.entity';
import { AssignmentBroadcast } from '../../database/entities/assignment-broadcast.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { RepStatus } from '../../common/enums/rep-status.enum';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';
import { AreasService } from '../areas/areas.service';
import { OrdersService } from '../orders/orders.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import {
  AssignmentScoringConfig,
  DEFAULT_ASSIGNMENT_SCORING,
} from '../../database/entities/platform-config.entity';

/** Priority score for a rep or vendor candidate */
interface ScoredCandidate {
  id: string;
  score: number;
  /** Fairness bucket [0,1] — used to reserve one broadcast slot for the most-starved candidate. */
  fairness: number;
}

/** Statuses that no longer occupy a provider (for open-load counting). */
const OPEN_LOAD_TERMINAL = ['completed', 'cancelled', 'delivered'];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Rep)
    private repRepository: Repository<Rep>,

    @InjectRepository(Vendor)
    private vendorRepository: Repository<Vendor>,

    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(AssignmentBroadcast)
    private broadcastRepository: Repository<AssignmentBroadcast>,

    @InjectRepository(OrderStatusHistory)
    private statusHistoryRepository: Repository<OrderStatusHistory>,

    private areasService: AreasService,
    // forwardRef: OrdersModule ↔ AssignmentModule cycle (placeOrder auto-starts assignment).
    @Inject(forwardRef(() => OrdersService))
    private ordersService: OrdersService,
    private notificationsService: NotificationsService,
    private configService: ConfigService,
    private platformConfigService: PlatformConfigService,
  ) {}

  /**
   * A rep's or vendor's own assignment offers — a pullable queue so they aren't
   * blind if a push/SMS never lands. `pending` = live offers awaiting response;
   * `history` = everything they responded to, missed, or that expired.
   */
  async myRequests(userId: string, targetType: 'rep' | 'vendor') {
    const entity =
      targetType === 'rep'
        ? await this.repRepository.findOne({ where: { userId } })
        : await this.vendorRepository.findOne({ where: { userId } });
    if (!entity) throw new NotFoundException(`${targetType} profile not found`);

    const rows = await this.broadcastRepository.find({
      where: { targetType, targetId: entity.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const orderIds = [...new Set(rows.map((r) => r.orderId))];
    const orders = orderIds.length ? await this.orderRepository.find({ where: { id: In(orderIds) } }) : [];
    const byId = new Map(orders.map((o) => [o.id, o]));
    const now = Date.now();
    const broadcastingStatus = targetType === 'rep' ? OrderStatus.BROADCASTING_REP : OrderStatus.BROADCASTING_VENDOR;

    const isLiveOffer = (b: AssignmentBroadcast) =>
      b.status === 'pending' &&
      (!b.expiresAt || new Date(b.expiresAt).getTime() > now) &&
      byId.get(b.orderId)?.status === broadcastingStatus;

    const shape = (b: AssignmentBroadcast) => {
      const o = byId.get(b.orderId);
      return {
        broadcastId: b.id,
        orderId: b.orderId,
        reference: o?.reference ?? null,
        broadcastStatus: b.status,
        batchNumber: b.batchNumber,
        expiresAt: b.expiresAt,
        respondedAt: b.respondedAt,
        createdAt: b.createdAt,
        orderStatus: o?.status ?? null,
        scheduledPickupAt: o?.scheduledPickupAt ?? null,
        pickupAddress: o?.pickupAddress ?? null,
      };
    };

    return {
      pending: rows.filter(isLiveOffer).map(shape),
      history: rows.filter((b) => !isLiveOffer(b)).map(shape),
    };
  }

  /**
   * Rep declines an offer: mark it, and if that was the batch's LAST live offer,
   * immediately broadcast the next batch instead of waiting out the window.
   */
  async repDeclines(orderId: string, repUserId: string): Promise<{ declined: boolean }> {
    const rep = await this.repRepository.findOne({ where: { userId: repUserId } });
    if (!rep) return { declined: false };

    const broadcast = await this.broadcastRepository.findOne({
      where: { orderId, targetId: rep.id, targetType: 'rep', status: 'pending' },
    });
    if (!broadcast) return { declined: false };

    broadcast.status = 'declined';
    broadcast.respondedAt = new Date();
    await this.broadcastRepository.save(broadcast);

    await this.advanceBatchIfExhausted(orderId, 'rep', broadcast.batchNumber);
    return { declined: true };
  }

  /** Vendor declines an offer — same fast-forward semantics as repDeclines. */
  async vendorDeclines(orderId: string, vendorUserId: string): Promise<{ declined: boolean }> {
    const vendor = await this.vendorRepository.findOne({ where: { userId: vendorUserId } });
    if (!vendor) return { declined: false };

    const broadcast = await this.broadcastRepository.findOne({
      where: { orderId, targetId: vendor.id, targetType: 'vendor', status: 'pending' },
    });
    if (!broadcast) return { declined: false };

    broadcast.status = 'declined';
    broadcast.respondedAt = new Date();
    await this.broadcastRepository.save(broadcast);

    await this.advanceBatchIfExhausted(orderId, 'vendor', broadcast.batchNumber);
    return { declined: true };
  }

  /** When every offer in the current batch is resolved, move to the next batch now. */
  private async advanceBatchIfExhausted(orderId: string, targetType: 'rep' | 'vendor', batchNumber: number) {
    const stillPending = await this.broadcastRepository.count({
      where: { orderId, targetType, status: 'pending' },
    });
    if (stillPending > 0) return;

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    const expectedStatus = targetType === 'rep' ? OrderStatus.BROADCASTING_REP : OrderStatus.BROADCASTING_VENDOR;
    if (!order || order.status !== expectedStatus) return;

    this.logger.log(`Order ${orderId}: batch ${batchNumber} fully declined — advancing ${targetType} broadcast`);
    if (targetType === 'rep') {
      await this.broadcastReps(orderId, order.areaId, batchNumber + 1);
    } else {
      await this.broadcastVendors(orderId, order.areaId, batchNumber + 1);
    }
  }

  // ─── Broadcast batch size / window from ENV ───────────────────────────────────

  private get broadcastN(): number {
    return this.configService.get<number>('ASSIGNMENT_BROADCAST_N') ?? 3;
  }
  private get windowSeconds(): number {
    return this.configService.get<number>('ASSIGNMENT_WINDOW_SECONDS') ?? 90;
  }

  // ─── Start rep assignment for an order ───────────────────────────────────────

  async startRepAssignment(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.PAID) return;

    await this.ordersService.transition(orderId, OrderStatus.BROADCASTING_REP, null, 'system');
    await this.broadcastReps(orderId, order.areaId, 1);
  }

  // ─── Broadcast reps in a batch ────────────────────────────────────────────────

  async broadcastReps(orderId: string, areaId: string, batchNumber: number): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return;

    // Get already-notified rep IDs
    const notified = await this.broadcastRepository.find({
      where: { orderId, targetType: 'rep' },
      select: ['targetId'],
    });
    const notifiedIds = notified.map((b) => b.targetId);

    // Score available reps in the area
    const candidates = await this.scoreReps(areaId, notifiedIds, orderId);

    if (candidates.length === 0) {
      // Try adjacent areas
      const area = await this.areasService.findOne(areaId);
      for (const adjacentId of area.adjacentAreaIds) {
        const adjacentCandidates = await this.scoreReps(adjacentId, notifiedIds, orderId);
        if (adjacentCandidates.length > 0) {
          await this.broadcastReps(orderId, adjacentId, batchNumber);
          return;
        }
      }

      // All areas exhausted — escalate to admin
      this.logger.warn(`Order ${orderId}: No available reps found in any area — escalating`);
      await this.statusHistoryRepository.save(
        this.statusHistoryRepository.create({
          orderId,
          fromStatus: order.status,
          toStatus:   order.status,
          triggeredBy: null,
          triggeredByRole: 'system',
          note: 'No available reps found in any area — requires manual admin assignment',
        }),
      );
      // Notify admin
      this.notificationsService.notifyNoRepsAvailableAdmin({
        orderRef: order.reference,
        areaName: areaId,
        orderId,
      });
      return;
    }

    // Take top N
    const batch = candidates.slice(0, this.broadcastN);
    const expiresAt = new Date(Date.now() + this.windowSeconds * 1000);

    for (const candidate of batch) {
      const record = this.broadcastRepository.create({
        orderId,
        targetType:    'rep',
        targetId:      candidate.id,
        batchNumber,
        priorityScore: candidate.score,
        status:        'pending',
        expiresAt,
      });
      await this.broadcastRepository.save(record);
    }

    this.logger.log(
      `Order ${orderId}: Broadcasting to ${batch.length} reps (batch ${batchNumber}), window: ${this.windowSeconds}s`,
    );

    // Notify each rep
    const scheduledPickupAt = order.scheduledPickupAt
      ? new Date(order.scheduledPickupAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    for (const candidate of batch) {
      this.notificationsService.notifyAssignmentBroadcastRep({
        repId:            candidate.id,
        orderRef:         order.reference,
        pickupAddress:    order.pickupAddress,
        scheduledPickupAt,
        orderId,
      });
    }
  }

  // ─── Rep accepts assignment ───────────────────────────────────────────────────

  async repAccepts(orderId: string, repUserId: string): Promise<Order | null> {
    // Callers authenticate as the USER — resolve their rep profile first.
    const rep = await this.repRepository.findOne({ where: { userId: repUserId } });
    if (!rep) return null;
    const repId = rep.id;
    const broadcast = await this.broadcastRepository.findOne({
      where: { orderId, targetId: repId, targetType: 'rep', status: 'pending' },
    });
    if (!broadcast) return null;
    if (broadcast.expiresAt && broadcast.expiresAt < new Date()) return null;

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.BROADCASTING_REP) return null;

    // Mark this broadcast as accepted
    broadcast.status      = 'accepted';
    broadcast.respondedAt = new Date();
    await this.broadcastRepository.save(broadcast);

    // Cancel all other pending broadcasts for this order (rep targets)
    await this.broadcastRepository
      .createQueryBuilder()
      .update(AssignmentBroadcast)
      .set({ status: 'cancelled' })
      .where('orderId = :orderId AND targetType = :type AND status = :s AND id != :id', {
        orderId, type: 'rep', s: 'pending', id: broadcast.id,
      })
      .execute();

    // Assign rep to order
    order.repId = repId;
    order.status = OrderStatus.REP_ASSIGNED;
    await this.orderRepository.save(order);

    // Scoring signals: accept latency (broadcast→accept) + recency
    Object.assign(rep, this.acceptSignalPatch(rep, broadcast.createdAt));
    await this.repRepository.save(rep);

    await this.statusHistoryRepository.save(
      this.statusHistoryRepository.create({
        orderId,
        fromStatus: OrderStatus.BROADCASTING_REP,
        toStatus:   OrderStatus.REP_ASSIGNED,
        triggeredBy: repId,
        triggeredByRole: 'rep',
        note: 'Rep accepted assignment',
      }),
    );

    // Notify rep of confirmed assignment
    this.notificationsService.notifyAssignmentConfirmedRep({
      repId:         repId,
      orderRef:      order.reference,
      pickupAddress: order.pickupAddress,
      customerName:  '',    // will be looked up inside notifyAssignmentConfirmedRep via customer ID if needed
      orderId,
    });

    // Start vendor assignment
    await this.startVendorAssignment(orderId);

    return order;
  }

  // ─── Start vendor assignment ──────────────────────────────────────────────────

  async startVendorAssignment(orderId: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return;

    await this.ordersService.transition(orderId, OrderStatus.BROADCASTING_VENDOR, null, 'system');
    await this.broadcastVendors(orderId, order.areaId, 1);
  }

  // ─── Broadcast vendors in a batch ────────────────────────────────────────────

  async broadcastVendors(orderId: string, areaId: string, batchNumber: number): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return;

    const notified = await this.broadcastRepository.find({
      where: { orderId, targetType: 'vendor' },
      select: ['targetId'],
    });
    const notifiedIds = notified.map((b) => b.targetId);

    const candidates = await this.scoreVendors(areaId, notifiedIds, orderId);

    if (candidates.length === 0) {
      const area = await this.areasService.findOne(areaId);
      for (const adjacentId of area.adjacentAreaIds) {
        const adjacentCandidates = await this.scoreVendors(adjacentId, notifiedIds, orderId);
        if (adjacentCandidates.length > 0) {
          await this.broadcastVendors(orderId, adjacentId, batchNumber);
          return;
        }
      }
      // All areas exhausted — escalate to admin (mirror the rep path).
      this.logger.warn(`Order ${orderId}: No available vendors found in any area — escalating`);
      await this.statusHistoryRepository.save(
        this.statusHistoryRepository.create({
          orderId,
          fromStatus: order.status,
          toStatus:   order.status,
          triggeredBy: null,
          triggeredByRole: 'system',
          note: 'No available vendors found in any area — requires manual admin assignment',
        }),
      );
      this.notificationsService.notifyNoVendorsAvailableAdmin({
        orderRef: order.reference,
        areaName: areaId,
        orderId,
      });
      return;
    }

    const batch     = candidates.slice(0, this.broadcastN);
    const expiresAt = new Date(Date.now() + this.windowSeconds * 1000);

    for (const candidate of batch) {
      const record = this.broadcastRepository.create({
        orderId,
        targetType:    'vendor',
        targetId:      candidate.id,
        batchNumber,
        priorityScore: candidate.score,
        status:        'pending',
        expiresAt,
      });
      await this.broadcastRepository.save(record);
    }

    this.logger.log(
      `Order ${orderId}: Broadcasting to ${batch.length} vendors (batch ${batchNumber})`,
    );

    // Notify each vendor
    const scheduledPickupAt = order.scheduledPickupAt
      ? new Date(order.scheduledPickupAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    for (const candidate of batch) {
      this.notificationsService.notifyAssignmentBroadcastVendor({
        vendorId:          candidate.id,
        orderRef:          order.reference,
        scheduledPickupAt,
        orderId,
      });
    }
  }

  // ─── Vendor accepts assignment ────────────────────────────────────────────────

  async vendorAccepts(orderId: string, vendorUserId: string): Promise<Order | null> {
    // Callers authenticate as the USER — resolve their vendor profile first.
    const vendor = await this.vendorRepository.findOne({ where: { userId: vendorUserId } });
    if (!vendor) return null;
    const vendorId = vendor.id;
    const broadcast = await this.broadcastRepository.findOne({
      where: { orderId, targetId: vendorId, targetType: 'vendor', status: 'pending' },
    });
    if (!broadcast) return null;
    if (broadcast.expiresAt && broadcast.expiresAt < new Date()) return null;

    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order || order.status !== OrderStatus.BROADCASTING_VENDOR) return null;

    broadcast.status      = 'accepted';
    broadcast.respondedAt = new Date();
    await this.broadcastRepository.save(broadcast);

    await this.broadcastRepository
      .createQueryBuilder()
      .update(AssignmentBroadcast)
      .set({ status: 'cancelled' })
      .where('orderId = :orderId AND targetType = :type AND status = :s AND id != :id', {
        orderId, type: 'vendor', s: 'pending', id: broadcast.id,
      })
      .execute();

    order.vendorId = vendorId;
    order.status   = OrderStatus.VENDOR_ASSIGNED;
    await this.orderRepository.save(order);

    // Scoring signals: accept latency (broadcast→accept) + recency
    Object.assign(vendor, this.acceptSignalPatch(vendor, broadcast.createdAt));
    await this.vendorRepository.save(vendor);

    await this.statusHistoryRepository.save(
      this.statusHistoryRepository.create({
        orderId,
        fromStatus: OrderStatus.BROADCASTING_VENDOR,
        toStatus:   OrderStatus.VENDOR_ASSIGNED,
        triggeredBy: vendorId,
        triggeredByRole: 'vendor',
        note: 'Vendor accepted assignment',
      }),
    );

    // Advance to scheduled
    await this.ordersService.transition(orderId, OrderStatus.SCHEDULED, null, 'system');

    return order;
  }

  // ─── Admin manual assignment ──────────────────────────────────────────────────

  async adminAssignRep(orderId: string, repId: string, adminId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return null;

    order.repId  = repId;
    order.status = OrderStatus.REP_ASSIGNED;
    await this.orderRepository.save(order);

    await this.repRepository.update(repId, { lastAssignedAt: new Date() });

    await this.statusHistoryRepository.save(
      this.statusHistoryRepository.create({
        orderId,
        fromStatus: order.status,
        toStatus:   OrderStatus.REP_ASSIGNED,
        triggeredBy: adminId,
        triggeredByRole: 'admin',
        note: 'Manually assigned by admin',
      }),
    );

    return order;
  }

  async adminAssignVendor(orderId: string, vendorId: string, adminId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return null;

    order.vendorId = vendorId;
    order.status   = OrderStatus.VENDOR_ASSIGNED;
    await this.orderRepository.save(order);

    await this.vendorRepository.update(vendorId, { lastAssignedAt: new Date() });

    await this.statusHistoryRepository.save(
      this.statusHistoryRepository.create({
        orderId,
        fromStatus: order.status,
        toStatus:   OrderStatus.VENDOR_ASSIGNED,
        triggeredBy: adminId,
        triggeredByRole: 'admin',
        note: 'Vendor manually assigned by admin',
      }),
    );

    await this.ordersService.transition(orderId, OrderStatus.SCHEDULED, null, 'system');
    return order;
  }

  // ─── Broadcast history ────────────────────────────────────────────────────────

  async getBroadcastHistory(orderId: string) {
    return this.broadcastRepository.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }

  // ─── Priority scoring ─────────────────────────────────────────────────────────

  private async scoreReps(
    areaId: string,
    excludeIds: string[],
    orderId: string,
  ): Promise<ScoredCandidate[]> {
    const qb = this.repRepository
      .createQueryBuilder('r')
      .where('r.is_available = true')
      .andWhere('r.status = :status', { status: RepStatus.ACTIVE })
      .andWhere(`r.area_ids::jsonb @> :areaId::jsonb`, { areaId: JSON.stringify([areaId]) });

    if (excludeIds.length > 0) {
      qb.andWhere('r.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const reps = await qb.getMany();
    const cfg = await this.scoringConfig();
    const openLoad = await this.openOrderCounts('rep_id', reps.map((r) => r.id));

    const scored = reps
      .filter((rep) => (openLoad.get(rep.id) ?? 0) < cfg.loadCap) // hard load cap
      .map((rep) => this.computeRepScore(rep, cfg, openLoad.get(rep.id) ?? 0))
      .sort((a, b) => b.score - a.score);

    return this.applyFairnessSlot(scored, cfg);
  }

  private async scoreVendors(
    areaId: string,
    excludeIds: string[],
    orderId: string,
  ): Promise<ScoredCandidate[]> {
    const qb = this.vendorRepository
      .createQueryBuilder('v')
      .where('v.is_available = true')
      .andWhere('v.verification_status = :vs', { vs: VendorVerificationStatus.VERIFIED })
      .andWhere(`v.area_ids::jsonb @> :areaId::jsonb`, { areaId: JSON.stringify([areaId]) });

    if (excludeIds.length > 0) {
      qb.andWhere('v.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const vendors = await qb.getMany();
    const cfg = await this.scoringConfig();
    const openLoad = await this.openOrderCounts('vendor_id', vendors.map((v) => v.id));

    const scored = vendors
      .filter((v) => (openLoad.get(v.id) ?? 0) < cfg.loadCap) // hard load cap
      .map((v) => this.computeVendorScore(v, cfg, openLoad.get(v.id) ?? 0))
      .sort((a, b) => b.score - a.score);

    return this.applyFairnessSlot(scored, cfg);
  }

  /**
   * Rep priority score formula:
   *  base = rating × 20 (0–100 points)
   *  admin priority bonus: lower number = higher bonus (max +50)
   *  Result: higher is better
   */
  // ─── Composite scoring: score = 100·(wP·P + wL·L + wF·F) ────────────────────────
  // All sub-signals normalize to [0,1]; unknown signals score a neutral 0.5 so new
  // providers aren't punished for missing history. Weights/constants live in
  // platform_config.assignment_scoring (admin-tunable, no deploy needed).

  private async scoringConfig(): Promise<AssignmentScoringConfig> {
    const config = await this.platformConfigService.getConfig();
    return { ...DEFAULT_ASSIGNMENT_SCORING, ...(config.assignmentScoring ?? {}) };
  }

  /** Open (non-terminal) order count per candidate, one grouped query. */
  private async openOrderCounts(column: 'rep_id' | 'vendor_id', ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const rows = await this.orderRepository
      .createQueryBuilder('o')
      .select(`o.${column}`, 'pid')
      .addSelect('COUNT(*)', 'n')
      .where(`o.${column} IN (:...ids)`, { ids })
      .andWhere('o.status NOT IN (:...terminal)', { terminal: OPEN_LOAD_TERMINAL })
      .groupBy(`o.${column}`)
      .getRawMany<{ pid: string; n: string }>();
    return new Map(rows.map((r) => [r.pid, Number(r.n)]));
  }

  /** Fairness bucket, shared shape for reps and vendors. */
  private fairnessScore(
    cfg: AssignmentScoringConfig,
    lastAssignedAt: Date | null,
    createdAt: Date,
    openOrders: number,
    completedJobs: number,
  ): number {
    const sinceMs = Date.now() - new Date(lastAssignedAt ?? createdAt).getTime();
    const recency = clamp01(sinceMs / (cfg.recencyCapH * 3600_000));
    const loadRoom = clamp01(1 - openOrders / cfg.loadCap);
    const newbie = completedJobs < cfg.newbieN ? 1 : 0;
    return 0.5 * recency + 0.3 * loadRoom + 0.2 * newbie;
  }

  /** Reserve one of the top-N slots for the most-starved (highest fairness) candidate. */
  private applyFairnessSlot(sorted: ScoredCandidate[], cfg: AssignmentScoringConfig): ScoredCandidate[] {
    if (!cfg.fairnessSlot || sorted.length <= this.broadcastN) return sorted;
    const topN = sorted.slice(0, this.broadcastN);
    const maxFair = sorted.reduce((best, c) => (c.fairness > best.fairness ? c : best), sorted[0]);
    if (topN.some((c) => c.id === maxFair.id)) return sorted;
    // Swap the most-starved candidate into the last slot of the first batch.
    const rest = sorted.filter((c) => c.id !== maxFair.id);
    return [...rest.slice(0, this.broadcastN - 1), maxFair, ...rest.slice(this.broadcastN - 1)];
  }

  private computeRepScore(rep: Rep, cfg: AssignmentScoringConfig, openOrders: number): ScoredCandidate {
    const windowSec = this.windowSeconds;

    // Performance
    const rating01   = clamp01((rep.rating ?? 0) / 5);
    const onTime01   = rep.totalDeliveries > 0 ? clamp01(rep.onTimeDeliveries / rep.totalDeliveries) : 0.5;
    const latency01  = rep.avgAcceptLatencySec != null ? clamp01(1 - rep.avgAcceptLatencySec / windowSec) : 0.5;
    const complete01 = rep.acceptCount > 0 ? clamp01(rep.totalDeliveries / rep.acceptCount) : 0.5;
    const P = 0.4 * rating01 + 0.25 * onTime01 + 0.2 * latency01 + 0.15 * complete01;

    // Loyalty (loyalty-points ledger lands here later as a third term)
    const profile01 = (rep.phone ? 0.5 : 0) + (rep.contractUrl ? 0.5 : 0);
    const tenure01  = clamp01(Math.log(1 + rep.totalDeliveries) / Math.log(1 + cfg.satOrders));
    const L = 0.5 * profile01 + 0.5 * tenure01;

    // Fairness
    const F = this.fairnessScore(cfg, rep.lastAssignedAt, rep.createdAt, openOrders, rep.totalDeliveries);

    // Admin nudge retained: assignmentPriority (lower = preferred) adds up to +5 points.
    const priorityBonus = Math.max(0, 100 - (rep.assignmentPriority ?? 100)) / 20;

    return {
      id: rep.id,
      score: Math.round((100 * (cfg.wPerf * P + cfg.wLoyalty * L + cfg.wFair * F) + priorityBonus) * 100) / 100,
      fairness: F,
    };
  }

  /**
   * Vendor priority score formula:
   *  base = rating × 20 (0–100 points)
   */
  private computeVendorScore(vendor: Vendor, cfg: AssignmentScoringConfig, openOrders: number): ScoredCandidate {
    const windowSec = this.windowSeconds;

    // Performance (vendors have no delivery counters — rating leads, latency assists)
    const rating01  = clamp01((vendor.rating ?? 0) / 5);
    const latency01 = vendor.avgAcceptLatencySec != null ? clamp01(1 - vendor.avgAcceptLatencySec / windowSec) : 0.5;
    const P = 0.7 * rating01 + 0.3 * latency01;

    // Loyalty
    const profile01 =
      (vendor.businessName ? 0.4 : 0) + (vendor.logoUrl ? 0.3 : 0) + (vendor.phone ? 0.3 : 0);
    const tenure01 = clamp01(Math.log(1 + vendor.acceptCount) / Math.log(1 + cfg.satOrders));
    const L = 0.5 * profile01 + 0.5 * tenure01;

    // Fairness
    const F = this.fairnessScore(cfg, vendor.lastAssignedAt, vendor.createdAt, openOrders, vendor.acceptCount);

    return {
      id: vendor.id,
      score: Math.round(100 * (cfg.wPerf * P + cfg.wLoyalty * L + cfg.wFair * F) * 100) / 100,
      fairness: F,
    };
  }

  /** Incremental rolling mean + recency counters, recorded when a provider accepts. */
  private acceptSignalPatch(
    current: { avgAcceptLatencySec: number | null; acceptCount: number },
    broadcastCreatedAt: Date,
  ) {
    const latencySec = Math.max(0, (Date.now() - new Date(broadcastCreatedAt).getTime()) / 1000);
    const n = current.acceptCount ?? 0;
    const newAvg =
      current.avgAcceptLatencySec == null
        ? latencySec
        : current.avgAcceptLatencySec + (latencySec - current.avgAcceptLatencySec) / (n + 1);
    return {
      avgAcceptLatencySec: Math.round(newAvg * 100) / 100,
      acceptCount: n + 1,
      lastAssignedAt: new Date(),
    };
  }
}
