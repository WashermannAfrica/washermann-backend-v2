import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type WashRepApplicationStatus = 'new' | 'reviewing' | 'accepted' | 'rejected';

/**
 * Wash Rep (field logistics agent) application submitted from the public
 * "Who it's for → Wash Rep" form on the marketing site.
 */
@Entity('wash_rep_applications')
export class WashRepApplication extends BaseEntity {
  @ApiProperty({ example: 'Tunde Bello' })
  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @ApiProperty({ example: 'tunde@example.com' })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @ApiProperty({ example: 'Ikeja', description: 'LGA / area of Lagos' })
  @Column({ name: 'area_of_lagos', type: 'varchar', length: 100 })
  areaOfLagos: string;

  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @Column({ type: 'varchar', length: 500 })
  address: string;

  @ApiProperty({ example: true, description: 'Has worked as a logistics person before' })
  @Column({ name: 'worked_logistics', type: 'boolean' })
  workedLogistics: boolean;

  @ApiProperty({ example: false, description: 'Has worked in a laundromat / laundry shop before' })
  @Column({ name: 'worked_laundromat', type: 'boolean' })
  workedLaundromat: boolean;

  @ApiProperty({ example: 'new', enum: ['new', 'reviewing', 'accepted', 'rejected'] })
  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: WashRepApplicationStatus;
}
