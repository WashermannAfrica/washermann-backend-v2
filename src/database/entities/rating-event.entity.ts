import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

/**
 * One rating event per completed order.
 *
 * Customer rates two things independently:
 *  - repScore: logistics experience (pickup + delivery)
 *  - vendorScore: laundry quality (washing)
 *
 * Both are optional — customer may skip one or both.
 *
 * After each new event the rolling 30-day average is recalculated
 * on the Rep and Vendor records respectively.
 */
@Entity('rating_events')
export class RatingEvent {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty()
  @Column({ name: 'order_id', type: 'uuid', unique: true })
  orderId: string;

  @ApiProperty()
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @ApiProperty({ nullable: true })
  @Column({ name: 'rep_id', type: 'uuid', nullable: true })
  repId: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Rep logistics rating 1–5',
    minimum: 1,
    maximum: 5,
  })
  @Column({ name: 'rep_score', type: 'int', nullable: true })
  repScore: number | null;

  @ApiProperty({
    nullable: true,
    description: 'Vendor laundry quality rating 1–5',
    minimum: 1,
    maximum: 5,
  })
  @Column({ name: 'vendor_score', type: 'int', nullable: true })
  vendorScore: number | null;

  @ApiProperty({ nullable: true, description: 'Optional text feedback from customer' })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'submitted_at', type: 'timestamp with time zone' })
  submittedAt: Date;
}
