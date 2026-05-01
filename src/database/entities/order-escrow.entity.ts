import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Order } from './order.entity';
import { BigIntTransformer, DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * Escrow record — created the moment an order is paid.
 *
 * The WP is held here until the order reaches 'completed'.
 * On completion the escrow is debited and split across vendor,
 * rep pseudo-wallet, and platform revenue pool.
 *
 * The nairaEquivalent is frozen at creation time so financial
 * records remain reconcilable regardless of future rate changes.
 */
@Entity('order_escrows')
export class OrderEscrow {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @ApiProperty({ description: 'WashPoints held in escrow' })
  @Column({
    name: 'wp_amount',
    type: 'bigint',
    transformer: BigIntTransformer,
  })
  wpAmount: number;

  @ApiProperty({ description: 'Naira equivalent frozen at escrow creation' })
  @Column({
    name: 'naira_equivalent',
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: DecimalTransformer,
  })
  nairaEquivalent: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'conversion_rate_id', type: 'uuid', nullable: true })
  conversionRateId: string | null;

  @ApiProperty({ enum: ['held', 'released', 'refunded', 'disputed'] })
  @Column({ type: 'varchar', length: 20, default: 'held' })
  status: 'held' | 'released' | 'refunded' | 'disputed';

  @ApiProperty({ nullable: true })
  @Column({ name: 'released_at', type: 'timestamp with time zone', nullable: true })
  releasedAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToOne(() => Order, { eager: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
