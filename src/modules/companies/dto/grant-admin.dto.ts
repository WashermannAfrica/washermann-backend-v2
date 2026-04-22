import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { CompanyRole } from '../../../common/enums/company-role.enum';

export class GrantAdminDto {
  /**
   * OWNER — transfers full company ownership; only a current OWNER can do this.
   * ADMIN  — operational admin role; OWNER or platform ADMIN can grant this.
   */
  @ApiProperty({ enum: CompanyRole, default: CompanyRole.ADMIN })
  @IsNotEmpty()
  @IsEnum(CompanyRole)
  companyRole: CompanyRole;
}
