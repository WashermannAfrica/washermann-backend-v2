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
import { AddAreaLocationDto, DeactivateAreaDto, UpdateAreaLocationDto } from './dto/area-location.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
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

  // ─── Public: curated service areas + locations (for landing forms) ───────────

  @Get('public')
  @Public()
  @ApiOperation({ summary: 'Public: active service areas with their locations (curated dropdown)' })
  publicAreas() {
    return this.areasService.publicServiceAreas();
  }

  // ─── Admin: coverage gaps (uncovered-address demand signals) ──────────────────

  @Get('coverage-gaps')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Uncovered-address demand signals, newest first (admin) — where to open next' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  coverageGaps(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.areasService.listCoverageGaps(page ? Number(page) : 1, limit ? Number(limit) : 50);
  }

  // ─── Public: resolve a point to coverage (geofence check) ────────────────────

  @Get('resolve')
  @Public()
  @ApiOperation({
    summary: 'Resolve a lat/lng to coverage — covering area/location, or the nearest covered fallback',
  })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  async resolve(@Query('lat') lat: string, @Query('lng') lng: string) {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || Math.abs(nLat) > 90 || Math.abs(nLng) > 180) {
      return { resolved: false, reason: 'invalid_coordinates' };
    }
    const res = await this.areasService.resolveAreaForPoint(nLat, nLng, { source: 'resolve_check' });
    if (!res) return { resolved: false, reason: 'no_geofenced_locations' };
    return {
      resolved: true,
      covered: res.covered,
      distanceKm: res.distanceKm,
      area: { id: res.area.id, name: res.area.name, state: res.area.state, transportFeeWP: res.area.transportFeeWP },
      location: { id: res.location.id, name: res.location.name },
    };
  }

  // ─── Get one ─────────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get area by ID (detailed: locations, KPIs, recent orders)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.findOneDetailed(id);
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
  @ApiOperation({ summary: 'Deactivate an area (admin), optionally with a reason' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeactivateAreaDto) {
    return this.areasService.deactivate(id, dto);
  }

  // ─── Locations (admin only) ──────────────────────────────────────────────────

  @Get(':id/locations')
  @ApiOperation({ summary: 'List locations/towns for an area' })
  listLocations(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.listLocations(id);
  }

  @Get(':id/reps')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reps serving an area, with pickup/delivery counts (admin)' })
  areaReps(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.areaReps(id);
  }

  @Get(':id/vendors')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Vendors (washermen) serving an area, with order counts (admin)' })
  areaVendors(@Param('id', ParseUUIDPipe) id: string) {
    return this.areasService.areaVendors(id);
  }

  @Get(':id/orders')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Paginated orders in an area (admin)' })
  areaOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.areasService.areaOrders(id, page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @Post(':id/locations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Add a location/town to an area (admin)' })
  addLocation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddAreaLocationDto) {
    return this.areasService.addLocation(id, dto);
  }

  @Patch(':id/locations/:locationId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a location/town — name and/or geofence (admin)' })
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: UpdateAreaLocationDto,
  ) {
    return this.areasService.updateLocation(id, locationId, dto);
  }

  @Delete(':id/locations/:locationId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a location/town from an area (admin)' })
  removeLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
  ) {
    return this.areasService.removeLocation(id, locationId);
  }
}
