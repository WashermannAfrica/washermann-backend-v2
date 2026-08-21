import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RepsService } from './reps.service';
import { CreateRepDto } from './dto/create-rep.dto';
import { UpdateRepDto, UpdateRepAvailabilityDto } from './dto/update-rep.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { RepStatus } from '../../common/enums/rep-status.enum';

@ApiTags('Reps')
@Controller('reps')
export class RepsController {
  constructor(private readonly repsService: RepsService) {}

  // ─── Admin: Create rep ────────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new rep (admin only)' })
  create(@Body() dto: CreateRepDto, @Request() req: { user: { sub: string } }) {
    return this.repsService.create(dto, req.user.sub);
  }

  // ─── Admin: List reps ─────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List reps (admin/finance)' })
  @ApiQuery({ name: 'page',              required: false, type: Number })
  @ApiQuery({ name: 'limit',             required: false, type: Number })
  @ApiQuery({ name: 'search',            required: false, type: String })
  @ApiQuery({ name: 'status',            required: false, enum: RepStatus })
  @ApiQuery({ name: 'isAvailable',       required: false, type: Boolean })
  @ApiQuery({ name: 'flaggedForReview',  required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy',            required: false, type: String })
  @ApiQuery({ name: 'sortDir',           required: false, enum: ['ASC', 'DESC'] })
  findAll(
    @Query('page',             new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',            new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search')           search?: string,
    @Query('status')           status?: RepStatus,
    @Query('isAvailable')      isAvailable?: string,
    @Query('flaggedForReview') flaggedForReview?: string,
    @Query('sortBy')           sortBy?: string,
    @Query('sortDir')          sortDir?: 'ASC' | 'DESC',
  ) {
    return this.repsService.findAll({
      page, limit, search, status, sortBy, sortDir,
      isAvailable:      isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined,
      flaggedForReview: flaggedForReview === 'true' ? true : flaggedForReview === 'false' ? false : undefined,
    });
  }

  // ─── Admin: Get one rep ───────────────────────────────────────────────────────

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get rep by ID (admin/finance)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.repsService.findOne(id);
  }

  // ─── Admin: Update rep ────────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update rep (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRepDto) {
    return this.repsService.update(id, dto);
  }

  // ─── Admin: Clear rep flag ────────────────────────────────────────────────────

  @Post(':id/clear-flag')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Clear rep review flag after admin action (admin)' })
  clearFlag(@Param('id', ParseUUIDPipe) id: string) {
    return this.repsService.clearFlag(id);
  }

  // ─── Rep: Get own profile ─────────────────────────────────────────────────────

  @Get('me/profile')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Get own rep profile (rep)' })
  getMyProfile(@Request() req: { user: { sub: string } }) {
    return this.repsService.findByUserId(req.user.sub);
  }

  // ─── Rep: Toggle availability ─────────────────────────────────────────────────

  @Patch('me/availability')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Toggle own availability (rep)' })
  async setAvailability(
    @Body() dto: UpdateRepAvailabilityDto,
    @Request() req: { user: { sub: string } },
  ) {
    const rep = await this.repsService.findByUserId(req.user.sub);
    return this.repsService.setAvailability(rep.id, dto.isAvailable);
  }

  // ─── Admin: Pseudo-wallet ─────────────────────────────────────────────────────

  @Get(':id/wallet')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get rep pseudo-wallet (admin/finance)' })
  getWallet(@Param('id', ParseUUIDPipe) id: string) {
    return this.repsService.getWallet(id);
  }

  @Get(':id/wallet/ledger')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get rep pseudo-wallet ledger (admin/finance)' })
  getLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.repsService.getLedger(id, page, limit);
  }
}
