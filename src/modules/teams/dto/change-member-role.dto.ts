import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { TeamMemberRole } from '../../../common/enums/team-member-role.enum';

export class ChangeMemberRoleDto {
  @ApiProperty({ enum: TeamMemberRole, example: TeamMemberRole.ADMIN })
  @IsNotEmpty()
  @IsEnum(TeamMemberRole)
  role: TeamMemberRole;
}
