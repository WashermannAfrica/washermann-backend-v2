import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Area } from './area.entity';

/**
 * A named location / town within an Area (e.g. "VI", "Oniru" under "Victoria Island").
 * An area can have many locations; the admin adds them as chips on the area form.
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

  @ApiProperty({ default: true })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @ManyToOne(() => Area, (area) => area.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area?: Area;
}
