import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * Demand signal: a point (address) that fell OUTSIDE every location geofence.
 * With the nearest-covered-area fallback the order still proceeds, but each miss
 * is recorded here so ops can see where to open new locations/areas.
 */
@Entity('coverage_gaps')
@Index(['createdAt'])
export class CoverageGap extends BaseEntity {
  @ApiProperty({ nullable: true })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ApiProperty({ example: 6.6018 })
  @Column({ type: 'float' })
  latitude: number;

  @ApiProperty({ example: 3.3515 })
  @Column({ type: 'float' })
  longitude: number;

  @ApiProperty({ nullable: true })
  @Column({ name: 'address_text', type: 'varchar', length: 1000, nullable: true })
  addressText: string | null;

  @ApiProperty({ nullable: true, description: 'Nearest covered area the request was routed to (null = pure coverage check, no fallback)' })
  @Column({ name: 'fallback_area_id', type: 'uuid', nullable: true })
  fallbackAreaId: string | null;

  @ApiProperty({ nullable: true, description: 'Distance in km from the point to the fallback location center' })
  @Column({ name: 'distance_km', type: 'float', nullable: true })
  distanceKm: number | null;

  @ApiProperty({ enum: ['resolve_check', 'order_placed'], description: 'Where the miss was observed' })
  @Column({ type: 'varchar', length: 30 })
  source: 'resolve_check' | 'order_placed';
}
