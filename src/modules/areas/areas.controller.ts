import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  ParseBoolPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Areas')
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  // ─── Create (admin only) ─────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new geographic area (admin)' })
  create(@Body() dto: CreateAreaDto, @Request() req: { user: { sub: string } }) {
    return this.areasService.create(dto, req.user.sub);
  }

  // ─── List (any authenticated user — needed for pickup address resolution) ────

  @Get()
  @ApiOperation({ summary: 'List areas with optional filters' })
  @ApiQuery({ name: 'page',     required: false, type: Number })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'search',   required: false, type: String })
  @ApiQuery({ name: 'state',    required: false, type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  findAll(
    @Query('page',     new DefaultValuePipe(1),    ParseIntPipe) page: number,
    @Query('limit',    new DefaultValuePipe(50),   ParseIntPipe) limit: number,
    @Query('search')   search?: string,
    @Query('state')    state?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.areasService.findAll({
      page,
      limit,
      search,
      state,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get area by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.findOne(id);
  }

  // ─── Update (admin only) ─────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an area (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAreaDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.areasService.update(id, dto, req.user.sub);
  }

  // ─── Deactivate (admin only) ─────────────────────────────────────────────────

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate an area (admin)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.deactivate(id);
  }
}
