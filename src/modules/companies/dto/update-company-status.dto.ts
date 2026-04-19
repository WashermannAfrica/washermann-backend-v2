import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { CompanyStatus } from '../../../common/enums/company-status.enum';

export class UpdateCompanyStatusDto {
  @ApiProperty({ enum: CompanyStatus, example: CompanyStatus.INACTIVE })
  @IsNotEmpty()
  @IsEnum(CompanyStatus)
  status: CompanyStatus;
}
