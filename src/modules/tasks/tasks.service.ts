import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Order } from '../../database/entities/order.entity';
import { AssignmentBroadcast } from '../../database/entities/assignment-broadcast.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { OrdersService } from '../orders/orders.service';
import { AssignmentService } from '../assignment/assignment.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,

    @InjectRepository(AssignmentBroadcast)
    private broadcastRepository: Repository<AssignmentBroadcast>,

    private ordersService: OrdersService,
    private assignmentService: AssignmentService,
  ) {}

  // ─── Escrow auto-release ──────────────────────────────────────────────────────
  /**
   * Runs every 15 minutes.
   *
   * Finds all orders in DELIVERED status whose `autoCompleteAt` timestamp has
   * passed and auto-completes them — releasing escrow to the vendor and crediting
   * the rep pseudo-wallet. This prevents funds from being locked indefinitely when
   * a customer does not manually confirm delivery.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoReleaseEscrow() {
    const now = new Date();

    const overdueOrders = await this.orderRepository.find({
      where: {
        status:          OrderStatus.DELIVERED,
        autoCompleteAt:  LessThan(now),
      },
    });

    if (overdueOrders.length === 0) return;

    this.logger.log(`Auto-release: ${overdueOrders.length} overdue order(s) found`);

    for (const order of overdueOrders) {
      try {
        await this.ordersService.completeOrder(order.id, null, 'system');
        this.logger.log(`Auto-release: completed order ${order.id} (ref=${order.reference})`);
      } catch (err) {
        this.logger.error(
          `Auto-release: failed to complete order ${order.id} — ${(err as Error).message}`,
        );
      }
    }
  }

  // ─── Assignment broadcast expiry ──────────────────────────────────────────────
  /**
   * Runs every minute.
   *
   * Finds all pending assignment broadcasts that have passed their `expiresAt`
   * window without a response. Marks them as expired, then re-broadcasts to the
   * next available batch of reps or vendors.
   *
   * If no more candidates are found after expiry, the order stays in its current
   * status and the admin is notified via the status history log.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireAssignmentBroadcasts() {
    const now = new Date();

    // Find expired pending broadcasts
    const expired = await this.broadcastRepository.find({
      where: {
        status:    'pending' as any,
        expiresAt: LessThan(now),
      },
    });

    if (expired.length === 0) return;

    // Group by (orderId, targetType) — one re-broadcast call per group
    const groups = new Map<string, { orderId: string; targetType: 'rep' | 'vendor'; batchNumber: number }>();

    for (const broadcast of expired) {
      broadcast.status = 'expired' as any;
      await this.broadcastRepository.save(broadcast);

      const key = `${broadcast.orderId}:${broadcast.targetType}`;
      if (!groups.has(key)) {
        groups.set(key, {
          orderId:     broadcast.orderId,
          targetType:  broadcast.targetType as 'rep' | 'vendor',
          batchNumber: broadcast.batchNumber + 1,
        });
      } else {
        // Track the highest batch number in this expiry group
        const existing = groups.get(key)!;
        if (broadcast.batchNumber + 1 > existing.batchNumber) {
          existing.batchNumber = broadcast.batchNumber + 1;
        }
      }
    }

    this.logger.log(
      `Assignment expiry: ${expired.length} broadcast(s) expired across ${groups.size} order/type group(s)`,
    );

    // Re-broadcast for each distinct group
    for (const { orderId, targetType, batchNumber } of groups.values()) {
      try {
        const order = await this.orderRepository.findOne({ where: { id: orderId } });
        if (!order) continue;

        if (targetType === 'rep') {
          await this.assignmentService.broadcastReps(orderId, order.areaId, batchNumber);
        } else {
          await this.assignmentService.broadcastVendors(orderId, order.areaId, batchNumber);
        }

        this.logger.log(
          `Assignment expiry: re-broadcast ${targetType}s for order ${orderId} (batch ${batchNumber})`,
        );
      } catch (err) {
        this.logger.error(
          `Assignment expiry: re-broadcast failed for order ${orderId} — ${(err as Error).message}`,
        );
      }
    }
  }
}
