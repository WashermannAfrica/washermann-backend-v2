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
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { PricingIntelligenceService } from './pricing-intelligence.service';
import { PricingPackagesService } from './pricing-packages.service';
import { CalculatePriceDto } from './dto/calculate-price.dto';
import {
  CreatePricingPackageDto,
  UpdatePricingPackageDto,
  ApplyIntelligenceSuggestionsDto,
} from './dto/pricing-package.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingService: PricingService,
    private readonly intelligenceService: PricingIntelligenceService,
    private readonly packagesService: PricingPackagesService,
  ) {}

  // ─── Public / authenticated price calculation ─────────────────────────────────

  /**
   * Authoritative server-side price calculation.
   * Used by the client to show exact pre-payment total.
   * The order placement endpoint runs this again internally
   * (the client-provided total is never trusted).
   */
  @Post('calculate')
  @ApiOperation({
    summary: 'Calculate order price (authoritative)',
    description: 'Returns full itemised breakdown in WP. The server runs this again at order placement — the result here is for display only.',
  })
  calculate(@Body() dto: CalculatePriceDto) {
    return this.pricingService.calculate(dto);
  }

  /**
   * Returns the full pricing model for the given area.
   * Includes all-in prices (fees folded in), fee breakdown, and conversion info.
   * Cache this on the client for ~5 minutes.
   */
  @Get('model/:areaId')
  @ApiOperation({
    summary: 'Get full pricing model for client-side display',
    description:
      'Every price is returned in two forms: rawWP (base) and totalWP (base + service charge + VAT). ' +
      'Transport is a separate flat per-order fee. Cache client-side for ~5 minutes.',
  })
  getPricingModel(@Param('areaId', ParseUUIDPipe) areaId: string) {
    return this.pricingService.getClientConfig(areaId);
  }

  /** Legacy alias — kept for backward compatibility */
  @Get('config/:areaId')
  @ApiOperation({ summary: 'Get price config (legacy — prefer /pricing/model/:areaId)' })
  getClientConfig(@Param('areaId', ParseUUIDPipe) areaId: string) {
    return this.pricingService.getClientConfig(areaId);
  }

  // ─── Special pricing packages (customer) ─────────────────────────────────────

  /**
   * Returns pricing packages available to the requesting user.
   * Filters by audience rules, active status, and validity window.
   * Requires authentication so audience matching can be applied.
   */
  @Get('packages')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'List available pricing packages (audience-filtered)',
    description:
      'Returns packages visible to the requesting user based on their profile, ' +
      'order history, role, and area. Requires authentication.',
  })
  getPackagesForUser(@CurrentUser('id') userId: string) {
    return this.packagesService.findForUser(userId);
  }

  // ─── Admin: Price Intelligence ────────────────────────────────────────────────

  @Get('intelligence')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({
    summary: '[Admin] Vendor price intelligence report',
    description:
      'Aggregates all active vendor pricing per garment type. ' +
      'Returns statistical spread (min, p25, p50, p70, p75, p90, mean) and a ' +
      'platform price suggestion at the configured percentile (see priceSuggestionPercentile in platform config).',
  })
  getPriceIntelligence() {
    return this.intelligenceService.analyze();
  }

  @Post('intelligence/apply')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Apply intelligence price suggestions to platform price list',
    description:
      'For each garment type with a significant price difference, writes a new ' +
      'special_item entry to platform_price_list. Optionally filter by garmentTypes ' +
      'or set a toleranceWP to skip small changes.',
  })
  applyIntelligenceSuggestions(
    @Body() dto: ApplyIntelligenceSuggestionsDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.intelligenceService.applySuggestions(
      req.user.sub,
      dto.garmentTypes,
      dto.toleranceWP ?? 0,
    );
  }

  // ─── Admin: Special pricing packages ─────────────────────────────────────────

  @Post('packages/admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[Admin] Create a pricing package' })
  createPackage(
    @Body() dto: CreatePricingPackageDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.packagesService.create(dto, req.user.sub);
  }

  @Get('packages/admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: '[Admin] List all pricing packages (including inactive)' })
  listAllPackages() {
    return this.packagesService.findAll();
  }

  @Get('packages/admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: '[Admin] Get a single pricing package by ID' })
  getPackage(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.findOne(id);
  }

  @Patch('packages/admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Update a pricing package' })
  updatePackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricingPackageDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.packagesService.update(id, dto, req.user.sub);
  }

  @Delete('packages/admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Permanently delete a pricing package' })
  deletePackage(@Param('id', ParseUUIDPipe) id: string) {
    return this.packagesService.remove(id);
  }
}
