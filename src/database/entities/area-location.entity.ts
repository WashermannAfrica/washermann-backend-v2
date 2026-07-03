import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Area } from './area.entity';

/**
 * A named location / town within an Area (e.g. "VI", "Oniru" under "Victoria Island").
 * Each location is a CIRCLE geofence (center + radius); an Area's coverage region is
 * the union of its locations' circles. Coverage check = point-in-any-circle.
 * Geometry is nullable for legacy rows created before geofencing.
 */
@Entity('area_locations')
@Index(['areaId'])
export class AreaLocation extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'area_id', type: 'uuid' })
  areaId: string;

  @ApiProperty({ example: 'Oniru' })
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @ApiProperty({ nullable: true, example: 6.4281 })
  @Column({ name: 'center_lat', type: 'float', nullable: true })
  centerLat: number | null;

  @ApiProperty({ nullable: true, example: 3.4219 })
  @Column({ name: 'center_lng', type: 'float', nullable: true })
  centerLng: number | null;

  @ApiProperty({ nullable: true, example: 2.5, description: 'Coverage radius in km around the center' })
  @Column({ name: 'radius_km', type: 'float', nullable: true })
  radiusKm: number | null;

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => Area, (area) => area.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area?: Area;
}
