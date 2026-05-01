import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { BigIntTransformer } from '../../common/transformers/column.transformers';

/**
 * Geographic area record.
 *
 * Every Rep and Vendor is assigned to one or more areas.
 * When a customer places an order the system resolves their pickup address
 * to an area and routes assignment from there.
 *
 * adjacentAreaIds: ordered list of area UUIDs used for overflow assignment when
 * no Rep or Vendor is found in the primary area.
 */
@Entity('areas')
export class Area extends BaseEntity {
  @ApiProperty({ example: 'Lekki Phase 1' })
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @ApiProperty({ example: 'Lagos' })
  @Column({ type: 'varchar', length: 100 })
  state: string;

  @ApiProperty({ example: 'Eti-Osa', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  lga: string | null;

  @ApiProperty({ nullable: true })
  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @ApiProperty({
    description: 'Ordered list of area UUIDs for overflow assignment (closest first)',
    type: [String],
    example: ['uuid-1', 'uuid-2'],
  })
  @Column({ name: 'adjacent_area_ids', type: 'jsonb', default: '[]' })
  adjacentAreaIds: string[];

  @ApiProperty({
    description: 'Flat transport fee in WashPoints for orders in this area',
    example: 150,
  })
  @Column({
    name: 'transport_fee_wp',
    type: 'bigint',
    default: 0,
    transformer: BigIntTransformer,
  })
  transportFeeWP: number;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ApiProperty({ nullable: true, description: 'Admin who created this area' })
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;
}
