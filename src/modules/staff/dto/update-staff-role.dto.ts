import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../../common/enums/roles.enum';

export class UpdateStaffRoleDto {
  @ApiProperty({ enum: [Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE] })
  @IsEnum([Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE])
  role: Role;
}
