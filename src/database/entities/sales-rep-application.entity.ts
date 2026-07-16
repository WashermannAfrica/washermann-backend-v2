import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

export type SalesRepApplicationStatus = 'new' | 'reviewing' | 'accepted' | 'rejected';

/**
 * Sales Rep (acquisition / affiliate agent) application submitted from the public
 * "Become a Sales Rep" form. Distinct from a Wash Rep (field logistics) — a sales
 * rep refers customers & vendors and earns cash. Admin reviews → accept issues an
 * invite → onboarding (tutorial + assessment hard gate) → active.
 */
@Entity('sales_rep_applications')
export class SalesRepApplication extends BaseEntity {
  @ApiProperty({ example: 'Ada Obi' })
  @Column({ name: 'full_name', type: 'varchar', length: 200 })
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @ApiProperty({ example: 'ada@example.com' })
  @Column({ type: 'varchar', length: 320 })
  email: string;

  @ApiProperty({ example: 'Ikeja', description: 'LGA / area of Lagos' })
  @Column({ name: 'area_of_lagos', type: 'varchar', length: 100 })
  areaOfLagos: string;

  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @Column({ type: 'varchar', length: 500 })
  address: string;

  @ApiProperty({ example: true, description: 'Has sales / marketing experience before' })
  @Column({ name: 'has_sales_experience', type: 'boolean', default: false })
  hasSalesExperience: boolean;

  @ApiProperty({ example: 'I have a wide network of small businesses in Ikeja.', nullable: true })
  @Column({ name: 'why_join', type: 'text', nullable: true })
  whyJoin: string | null;

  @ApiProperty({ example: 'new', enum: ['new', 'reviewing', 'accepted', 'rejected'] })
  @Column({ type: 'varchar', length: 20, default: 'new' })
  status: SalesRepApplicationStatus;

  @ApiProperty({ nullable: true, description: 'Admin user id that reviewed the application' })
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'reviewed_at', type: 'timestamp with time zone', nullable: true })
  reviewedAt: Date | null;

  @ApiProperty({ nullable: true })
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @ApiProperty({ nullable: true, description: 'User account created on acceptance' })
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;
}
