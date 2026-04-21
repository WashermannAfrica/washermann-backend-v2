import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ConversionRateService } from './conversion-rate.service';
import { CreateConversionRateDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Conversion Rates')
@Controller('conversion-rates')
export class ConversionRateController {
  constructor(private readonly rateService: ConversionRateService) {}

  // ─── Public reads ────────────────────────────────────────────────────────────

  @Get('active')
  @Public()
  @ApiOperation({ summary: 'Get currently active conversion rate(s)' })
  @ApiQuery({ name: 'currency', required: false, example: 'NGN' })
  listActive(@Query('currency') currency?: string) {
    if (currency) {
      return this.rateService.getActiveRate(currency.toUpperCase()).then((r) => ({ data: r }));
    }
    return this.rateService.listActiveRates();
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get full conversion rate history' })
  @ApiQuery({ name: 'currency', required: false, example: 'NGN' })
  listAll(@Query('currency') currency?: string) {
    return this.rateService.listRates(currency);
  }

  // ─── Admin: security challenge ───────────────────────────────────────────────

  @Get('challenge')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get the security question for rate changes' })
  getChallenge() {
    return this.rateService.getSecurityChallenge();
  }

  // ─── Admin: create new rate ───────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '[Admin] Set a new conversion rate',
    description:
      'Requires the admin security answer (see GET /conversion-rates/challenge). ' +
      'The new rate becomes active after a configurable delay (default 60 min) ' +
      'to prevent exploitation of a freshly spiked rate.',
  })
  createRate(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateConversionRateDto,
  ) {
    return this.rateService.createRate(adminId, dto);
  }
}
