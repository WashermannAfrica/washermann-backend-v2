import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto, UpdateDisputeStatusDto } from './dto/manage-dispute.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  // ─── Customer ────────────────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Raise a dispute on one of your orders' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(userId, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My disputes (list screen) — with total/open/investigating/closed counts' })
  @ApiQuery({ name: 'status', required: false, description: 'reported|under_review|investigating|resolved|rejected' })
  @ApiQuery({ name: 'group', required: false, description: 'open | closed (tab filters)' })
  @ApiQuery({ name: 'search', required: false, description: 'ticket id / issue type' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  mine(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('group') group?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.disputes.listMine(userId, { status, group, search, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dispute detail + resolution timeline (owner or staff)' })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.disputes.getOne(id, userId, roles);
  }

  // ─── Admin / dispute resolver ──────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE, Role.DISPUTE_RESOLVER)
  @ApiOperation({ summary: '[Staff] All disputes' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'group', required: false, description: 'open | closed' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  adminList(
    @Query('status') status?: string,
    @Query('group') group?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.disputes.adminList({ status, group, search, page: page ? +page : 1, limit: limit ? +limit : 20 });
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.FINANCE, Role.DISPUTE_RESOLVER)
  @ApiOperation({ summary: '[Staff] Advance a dispute (under_review / investigating)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDisputeStatusDto,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.disputes.updateStatus(id, dto, this.staffRole(roles));
  }

  @Post(':id/resolve')
  @Roles(Role.ADMIN, Role.FINANCE, Role.DISPUTE_RESOLVER)
  @ApiOperation({ summary: '[Staff] Resolve or reject a dispute (optionally credit WashPoints)' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    return this.disputes.resolve(id, dto, userId, this.staffRole(roles));
  }

  private staffRole(roles: Role[]): string {
    if (roles.includes(Role.DISPUTE_RESOLVER)) return 'dispute_resolver';
    if (roles.includes(Role.ADMIN)) return 'admin';
    return 'staff';
  }
}
