import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { Company } from './company.entity';
import { CompanyEmployee } from './company-employee.entity';

@Entity('tiers')
export class Tier extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ApiProperty({ example: 'Senior Staff' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ example: 500, description: 'Points allocated per cycle' })
  @Column({ name: 'monthly_points', type: 'int' })
  monthlyPoints: number;

  @ApiProperty({ example: 4, description: 'Max orders per cycle' })
  @Column({ name: 'monthly_order_limit', type: 'int' })
  monthlyOrderLimit: number;

  @ApiProperty({ example: 10, description: 'Max items per order' })
  @Column({ name: 'item_limit', type: 'int' })
  itemLimit: number;

  // ─── Relations ───────────────────────────────────────────────────────────────
  @ManyToOne(() => Company, (c) => c.tiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => CompanyEmployee, (ce) => ce.tier)
  employeeAssignments: CompanyEmployee[];
}
