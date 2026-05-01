import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
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

/** Priority score for a rep or vendor candidate */
interface ScoredCandidate {
  id: string;
  score: number;
}

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
    private ordersService: OrdersService,
    private configService: ConfigService,
  ) {}

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

    // In production: send push notification to each rep
    this.logger.log(
      `Order ${orderId}: Broadcasting to ${batch.length} reps (batch ${batchNumber}), window: ${this.windowSeconds}s`,
    );
  }

  // ─── Rep accepts assignment ───────────────────────────────────────────────────

  async repAccepts(orderId: string, repId: string): Promise<Order | null> {
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
      this.logger.warn(`Order ${orderId}: No available vendors found — requires manual admin assignment`);
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
  }

  // ─── Vendor accepts assignment ────────────────────────────────────────────────

  async vendorAccepts(orderId: string, vendorId: string): Promise<Order | null> {
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
      .where('r.isAvailable = true')
      .andWhere('r.status = :status', { status: RepStatus.ACTIVE })
      .andWhere(`r.areaIds::jsonb @> :areaId::jsonb`, { areaId: JSON.stringify([areaId]) });

    if (excludeIds.length > 0) {
      qb.andWhere('r.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const reps = await qb.getMany();

    return reps
      .map((rep) => ({
        id:    rep.id,
        score: this.computeRepScore(rep),
      }))
      .sort((a, b) => b.score - a.score);
  }

  private async scoreVendors(
    areaId: string,
    excludeIds: string[],
    orderId: string,
  ): Promise<ScoredCandidate[]> {
    const qb = this.vendorRepository
      .createQueryBuilder('v')
      .where('v.isAvailable = true')
      .andWhere('v.verificationStatus = :vs', { vs: VendorVerificationStatus.VERIFIED })
      .andWhere(`v.areaIds::jsonb @> :areaId::jsonb`, { areaId: JSON.stringify([areaId]) });

    if (excludeIds.length > 0) {
      qb.andWhere('v.id NOT IN (:...excludeIds)', { excludeIds });
    }

    const vendors = await qb.getMany();

    return vendors
      .map((vendor) => ({
        id:    vendor.id,
        score: this.computeVendorScore(vendor),
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Rep priority score formula:
   *  base = rating × 20 (0–100 points)
   *  admin priority bonus: lower number = higher bonus (max +50)
   *  Result: higher is better
   */
  private computeRepScore(rep: Rep): number {
    const ratingScore    = (rep.rating ?? 0) * 20;
    const priorityBonus  = Math.max(0, 50 - (rep.assignmentPriority ?? 100));
    return ratingScore + priorityBonus;
  }

  /**
   * Vendor priority score formula:
   *  base = rating × 20 (0–100 points)
   */
  private computeVendorScore(vendor: Vendor): number {
    return (vendor.rating ?? 0) * 20;
  }
}
