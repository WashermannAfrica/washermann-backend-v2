import { Column, Entity, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { CompanyStatus } from '../../common/enums/company-status.enum';
import { CompanyActivationStatus } from '../../common/enums/company-activation-status.enum';
import { Tier } from './tier.entity';
import { CompanyEmployee } from './company-employee.entity';
import { CompanyAdmin } from './company-admin.entity';

@Entity('companies')
export class Company extends BaseEntity {
  // ─── Identity ──────────────────────────────────────────────────────────────────

  @ApiProperty({ example: 'Acme Corp' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  /**
   * The email the platform admin used to invite the company.
   * This becomes the login credential for the company owner account.
   * Immutable after creation — a re-invite requires deleting and re-creating.
   */
  @ApiProperty({ example: 'owner@acme.com' })
  @Column({ name: 'owner_email', type: 'varchar', length: 255, unique: true })
  ownerEmail: string;

  // ─── Activation lifecycle ──────────────────────────────────────────────────────

  @ApiProperty({ enum: CompanyActivationStatus })
  @Column({
    name: 'activation_status',
    type: 'varchar',
    length: 50,
    default: CompanyActivationStatus.PENDING,
  })
  activationStatus: CompanyActivationStatus;

  // ─── Platform status ───────────────────────────────────────────────────────────

  @ApiProperty({ enum: CompanyStatus })
  @Column({ type: 'varchar', length: 50, default: CompanyStatus.ACTIVE })
  status: CompanyStatus;

  // ─── Company profile (filled in during activation) ─────────────────────────────

  @ApiProperty({ example: '+2348012345678', nullable: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @ApiProperty({ example: 'Technology', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  industry: string | null;

  @ApiProperty({ example: '12 Business Way, Victoria Island, Lagos', nullable: true })
  @Column({ type: 'text', nullable: true })
  address: string | null;

  @ApiProperty({ example: 'https://acme.com', nullable: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  @ApiProperty({ example: 250, nullable: true })
  @Column({ name: 'number_of_workers', type: 'int', nullable: true })
  numberOfWorkers: number | null;

  @ApiProperty({ example: 'About Acme Corp', nullable: true })
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @OneToMany(() => Tier, (t) => t.company, { cascade: true })
  tiers: Tier[];

  @OneToMany(() => CompanyEmployee, (ce) => ce.company)
  employeeAssignments: CompanyEmployee[];

  @OneToMany(() => CompanyAdmin, (ca) => ca.company)
  adminAssignments: CompanyAdmin[];
}
