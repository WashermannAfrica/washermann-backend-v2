import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Order } from './order.entity';
import { OrderStatus } from '../../common/enums/order-status.enum';

/**
 * Append-only audit trail of every order status change.
 * Records who triggered the transition and when.
 */
@Entity('order_status_history')
export class OrderStatusHistory {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ApiProperty({ enum: OrderStatus })
  @Column({ name: 'from_status', type: 'varchar', length: 40, nullable: true })
  fromStatus: OrderStatus | null;

  @ApiProperty({ enum: OrderStatus })
  @Column({ name: 'to_status', type: 'varchar', length: 40 })
  toStatus: OrderStatus;

  @ApiProperty({ nullable: true, description: 'UUID of the user/rep/vendor/system who triggered' })
  @Column({ name: 'triggered_by', type: 'uuid', nullable: true })
  triggeredBy: string | null;

  @ApiProperty({ enum: ['system', 'customer', 'rep', 'vendor', 'admin'] })
  @Column({ name: 'triggered_by_role', type: 'varchar', length: 30 })
  triggeredByRole: 'system' | 'customer' | 'rep' | 'vendor' | 'admin';

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Order, { eager: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
