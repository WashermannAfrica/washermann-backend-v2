import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RateEngineService } from './rate-engine.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { ComputeRateDto } from './dto/compute-rate.dto';
import { UpdateRateConfigDto } from './dto/update-rate-config.dto';
import { DecideEpochDto } from './dto/decide-epoch.dto';

@ApiTags('Rate Engine')
@ApiBearerAuth()
@Controller('rate-engine')
export class RateEngineController {
  constructor(private readonly service: RateEngineService) {}

  @Get('config')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: current rate-engine config (V, weights, baselines, spreads)' })
  getConfig() {
    return this.service.getConfig();
  }

  @Put('config')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: update rate-engine config (weights must sum to 1)' })
  updateConfig(@Body() dto: UpdateRateConfigDto, @CurrentUser('id') adminId: string) {
    return this.service.updateConfig(dto, adminId);
  }

  @Post('compute')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: run a rate calculation with current economic values (logs a proposed epoch; does NOT apply)' })
  compute(@Body() dto: ComputeRateDto, @CurrentUser('id') adminId: string) {
    return this.service.compute(dto, adminId, dto.trigger ?? 'manual');
  }

  @Get('epochs')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: list rate epochs (filter: status)' })
  @ApiQuery({ name: 'status', required: false })
  listEpochs(@Query('status') status?: string) {
    return this.service.listEpochs(status);
  }

  @Get('epochs/:id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: get a rate epoch' })
  getEpoch(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getEpoch(id);
  }

  @Post('epochs/:id/approve')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: approve & apply a proposed epoch (sets the live rate)' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideEpochDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.approve(id, adminId, dto.note);
  }

  @Post('epochs/:id/reject')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: reject a proposed epoch (logged, not applied)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideEpochDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.reject(id, adminId, dto.note);
  }

  @Post('notify-review')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: manually fire the "rate review due" prompt to all admins' })
  notifyReview() {
    return this.service.notifyReview('manual');
  }
}
