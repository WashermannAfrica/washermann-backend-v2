import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { CalculatePriceDto } from './dto/calculate-price.dto';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

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
   * Returns the full price config for client-side real-time preview.
   * The client caches this and recalculates locally on every cart change
   * without an API call.
   */
  @Get('config/:areaId')
  @ApiOperation({
    summary: 'Get price config for local client-side calculation',
    description: 'Fetch once, cache for ~5 min, recalculate locally as the cart changes.',
  })
  getClientConfig(@Param('areaId', ParseUUIDPipe) areaId: string) {
    return this.pricingService.getClientConfig(areaId);
  }
}
