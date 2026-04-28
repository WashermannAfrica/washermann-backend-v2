import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../../common/enums/roles.enum';

export class InviteStaffDto {
  @ApiProperty({ example: 'resolver@washermann.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ enum: [Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE], description: 'Platform staff role' })
  @IsEnum([Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE])
  role: Role;
}
