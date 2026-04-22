import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import {
  CreateTeamDto,
  UpdateTeamDto,
  AddTeamMemberDto,
  ChangeMemberRoleDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Teams')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  // ─── Team CRUD ────────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a team',
    description:
      'Any authenticated user can create a team. ' +
      'The creator is automatically set as OWNER with full control.',
  })
  createTeam(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.createTeam(userId, dto);
  }

  @Get('mine')
  @ApiOperation({
    summary: 'List all teams the current user belongs to',
    description:
      'Returns all active team memberships for the current user, including their role in each team. ' +
      'Use this to power the team switcher on the dashboard.',
  })
  getMyTeams(@CurrentUser('id') userId: string) {
    return this.teamsService.getMyTeams(userId);
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Get team details' })
  getTeam(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.getTeam(teamId, userId, roles);
  }

  @Patch(':teamId')
  @ApiOperation({
    summary: 'Update team details',
    description: 'Any admin or owner of the team can update its details.',
  })
  updateTeam(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: UpdateTeamDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.updateTeam(teamId, dto, userId, roles);
  }

  @Delete(':teamId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a team (owner only)',
    description: 'Only the team OWNER (or platform ADMIN) can deactivate a team.',
  })
  deleteTeam(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.deleteTeam(teamId, userId, roles);
  }

  // ─── Members ─────────────────────────────────────────────────────────────────

  @Get(':teamId/members')
  @ApiOperation({ summary: 'List all active members of a team' })
  listMembers(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.listMembers(teamId, userId, roles);
  }

  @Post(':teamId/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add a member to a team by email or phone',
    description:
      'The target user must already have a Washermann account. ' +
      'Unlike companies, teams do not support inviting new users.',
  })
  addMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: AddTeamMemberDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.addMember(teamId, dto, userId, roles);
  }

  @Delete(':teamId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a member from a team',
    description:
      'OWNER or ADMIN can remove regular members. ' +
      'Removing an OWNER requires the caller to also be an OWNER. ' +
      'The last OWNER cannot be removed.',
  })
  removeMember(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.removeMember(teamId, memberId, userId, roles);
  }

  @Patch(':teamId/members/:memberId/role')
  @ApiOperation({
    summary: 'Change a member role (owner only)',
    description:
      'Only the team OWNER can promote/demote members. ' +
      'Promoting to OWNER transfers ownership. ' +
      'Demoting the last OWNER is blocked.',
  })
  changeMemberRole(
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: ChangeMemberRoleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.teamsService.changeMemberRole(
      teamId,
      memberId,
      dto,
      userId,
      roles,
    );
  }
}
