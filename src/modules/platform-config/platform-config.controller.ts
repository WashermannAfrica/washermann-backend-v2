import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformConfigService } from './platform-config.service';
import { UpdatePlatformConfigDto } from './dto/update-config.dto';
import { CreatePriceListEntryDto, UpdateBonusTierDto } from './dto/price-list.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Platform Config')
@Controller('platform-config')
export class PlatformConfigController {
  constructor(private readonly service: PlatformConfigService) {}

  // ─── Platform Config ──────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get platform configuration (admin/finance)' })
  getConfig() {
    return this.service.getConfig();
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update platform configuration (admin)' })
  updateConfig(
    @Body() dto: UpdatePlatformConfigDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.updateConfig(dto, req.user.sub);
  }

  // ─── Price List ───────────────────────────────────────────────────────────────

  @Get('price-list')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get all platform price list entries (admin/finance)' })
  getPriceList() {
    return this.service.getPriceList();
  }

  @Post('price-list')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a new price list entry (admin)' })
  addPriceEntry(
    @Body() dto: CreatePriceListEntryDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.addPriceEntry(dto, req.user.sub);
  }

  // ─── Bonus Tiers ──────────────────────────────────────────────────────────────

  @Get('bonus-tiers')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get all rep bonus tiers (admin/finance)' })
  getBonusTiers() {
    return this.service.getAllBonusTiers();
  }

  @Post('bonus-tiers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create or update a bonus tier (admin)' })
  upsertBonusTier(
    @Body() dto: UpdateBonusTierDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.service.upsertBonusTier(dto, req.user.sub);
  }

  @Delete('bonus-tiers/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate a bonus tier (admin)' })
  deactivateBonusTier(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deactivateBonusTier(id);
  }
}
