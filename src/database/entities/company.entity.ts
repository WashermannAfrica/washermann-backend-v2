import { Column, Entity, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { CompanyStatus } from '../../common/enums/company-status.enum';
import { Tier } from './tier.entity';
import { CompanyEmployee } from './company-employee.entity';
import { CompanyAdmin } from './company-admin.entity';

@Entity('companies')
export class Company extends BaseEntity {
  @ApiProperty({ example: 'Acme Corp' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 'hr@acme.com', nullable: true })
  @Column({ name: 'contact_email', type: 'varchar', length: 255, nullable: true })
  contactEmail: string | null;

  @ApiProperty({ example: '+2348012345678', nullable: true })
  @Column({ name: 'contact_phone', type: 'varchar', length: 50, nullable: true })
  contactPhone: string | null;

  @ApiProperty({ enum: CompanyStatus })
  @Column({ type: 'varchar', length: 50, default: CompanyStatus.ACTIVE })
  status: CompanyStatus;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @OneToMany(() => Tier, (t) => t.company, { cascade: true })
  tiers: Tier[];

  @OneToMany(() => CompanyEmployee, (ce) => ce.company)
  employeeAssignments: CompanyEmployee[];

  @OneToMany(() => CompanyAdmin, (ca) => ca.company)
  adminAssignments: CompanyAdmin[];
}
