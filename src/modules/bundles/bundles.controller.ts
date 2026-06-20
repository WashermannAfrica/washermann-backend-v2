import { Body, Controller, Get, Param, Patch, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BundlesService } from './bundles.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';

@ApiTags('Bundles')
@ApiBearerAuth()
@Controller('bundles')
export class BundlesController {
  constructor(private readonly service: BundlesService) {}

  @Get()
  @ApiOperation({ summary: 'List active bundles (with lines + effective price)' })
  list() {
    return this.service.list(false);
  }

  @Get('all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list all bundles incl. inactive' })
  listAll() {
    return this.service.list(true);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a bundle (with lines + pricing)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: create a bundle (price auto-derived: P70 × median qty)' })
  create(@Body() dto: CreateBundleDto, @CurrentUser('id') adminId: string) {
    return this.service.create(dto, adminId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: update a bundle (promo / lines change re-prices it)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBundleDto, @CurrentUser('id') adminId: string) {
    return this.service.update(id, dto, adminId);
  }
}
