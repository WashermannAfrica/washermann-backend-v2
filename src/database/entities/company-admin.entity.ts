import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { CompanyRole } from '../../common/enums/company-role.enum';
import { Company } from './company.entity';
import { User } from './user.entity';

@Entity('company_admins')
@Unique(['companyId', 'userId'])
export class CompanyAdmin extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /**
   * OWNER — the company account itself; veto rights, cannot be removed by a COMPANY_ADMIN.
   * ADMIN  — promoted by the owner; operational rights.
   */
  @ApiProperty({ enum: CompanyRole, default: CompanyRole.ADMIN })
  @Column({
    name: 'company_role',
    type: 'varchar',
    length: 20,
    default: CompanyRole.ADMIN,
  })
  companyRole: CompanyRole;

  // ─── Relations ───────────────────────────────────────────────────────────────

  @ManyToOne(() => Company, (c) => c.adminAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
