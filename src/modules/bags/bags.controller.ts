import { Body, Controller, Get, Param, Patch, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BagsService } from './bags.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { CreateBagDto, UpdateBagDto } from './dto/bag.dto';

@ApiTags('Bags')
@ApiBearerAuth()
@Controller('bags')
export class BagsController {
  constructor(private readonly service: BagsService) {}

  @Get()
  @ApiOperation({ summary: 'List active bags (Wash & Fold)' })
  list() {
    return this.service.list(false);
  }

  @Get('all')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list all bags incl. inactive' })
  listAll() {
    return this.service.list(true);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: create a bag (price auto-derived)' })
  create(@Body() dto: CreateBagDto, @CurrentUser('id') adminId: string) {
    return this.service.create(dto, adminId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: update a bag (capacity change re-prices it)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBagDto, @CurrentUser('id') adminId: string) {
    return this.service.update(id, dto, adminId);
  }
}
