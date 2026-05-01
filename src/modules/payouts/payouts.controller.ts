import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { RequestPayoutDto } from './dto/request-payout.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { PayoutStatus } from '../../common/enums/payout-status.enum';
import { VendorsService } from '../vendors/vendors.service';

@ApiTags('Payouts')
@Controller('payouts')
export class PayoutsController {
  constructor(
    private readonly payoutsService: PayoutsService,
    private readonly vendorsService: VendorsService,
  ) {}

  // ─── Vendor: request payout ───────────────────────────────────────────────────

  @Post('vendor/request')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Request a payout (vendor)' })
  async requestPayout(
    @Body() dto: RequestPayoutDto,
    @Request() req: { user: { sub: string } },
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.payoutsService.requestPayout(vendor.id, dto);
  }

  // ─── Vendor: own payout history ───────────────────────────────────────────────

  @Get('vendor/me')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get own payout history (vendor)' })
  async myPayouts(
    @Request() req: { user: { sub: string } },
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.payoutsService.getVendorPayouts(vendor.id, page, limit);
  }

  // ─── Admin: list all payouts ──────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List all payout requests (admin/finance)' })
  @ApiQuery({ name: 'page',     required: false, type: Number })
  @ApiQuery({ name: 'limit',    required: false, type: Number })
  @ApiQuery({ name: 'vendorId', required: false, type: String })
  @ApiQuery({ name: 'status',   required: false, enum: PayoutStatus })
  findAll(
    @Query('page',     new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',    new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('vendorId') vendorId?: string,
    @Query('status')   status?: PayoutStatus,
  ) {
    return this.payoutsService.findAll({ page, limit, vendorId, status });
  }

  // ─── Admin: approve payout ────────────────────────────────────────────────────

  @Post(':id/approve')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Approve a payout request (admin/finance)' })
  approvePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.payoutsService.approvePayout(id, req.user.sub);
  }

  // ─── Admin: trigger bonus cycle manually ──────────────────────────────────────

  @Post('bonus-cycle/run')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Manually trigger the rep bonus cycle (admin)',
    description: 'Calculates bonuses for all active reps based on their 30-day rating and resets cycle balances.',
  })
  triggerBonusCycle(@Request() req: { user: { sub: string } }) {
    return this.payoutsService.triggerBonusCycle(req.user.sub);
  }
}
