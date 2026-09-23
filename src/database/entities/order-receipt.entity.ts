import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Order } from './order.entity';

export type ReceiptParty = 'customer' | 'vendor' | 'rep' | 'platform';

/**
 * A generated receipt image for one party of a completed order. The PNG lives in
 * object storage (Cloudinary); this row records its URL so it can be served/shared
 * without regenerating. One row per (order, party).
 */
@Entity('order_receipts')
@Unique('UQ_order_receipts_order_party', ['orderId', 'party'])
export class OrderReceipt extends BaseEntity {
  @ApiProperty()
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ApiProperty({ enum: ['customer', 'vendor', 'rep', 'platform'] })
  @Column({ type: 'varchar', length: 12 })
  party: ReceiptParty;

  @ApiProperty({ description: 'Public URL of the rendered PNG' })
  @Column({ type: 'varchar', length: 2000 })
  url: string;

  @ApiProperty({ nullable: true, description: 'Storage provider id/public_id (for cleanup)' })
  @Column({ name: 'storage_key', type: 'varchar', length: 500, nullable: true })
  storageKey: string | null;

  @ManyToOne(() => Order, { eager: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;
}
