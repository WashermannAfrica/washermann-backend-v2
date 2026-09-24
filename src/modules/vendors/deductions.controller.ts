import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { CreateDeductionDto, RespondDeductionDto, CancelDeductionDto } from './dto/earnings-deduction.dto';

/** Vendor earnings deductions with a response window (WS4 1.11). */
@ApiTags('Earnings deductions')
@ApiBearerAuth()
@Controller('earnings-deductions')
export class DeductionsController {
  constructor(private readonly vendorsService: VendorsService) {}

  // ─── Admin ──────────────────────────────────────────────────────────────────
  @Post()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Raise a claim deduction against a vendor (notice + response window)' })
  create(@Body() dto: CreateDeductionDto, @Request() req: { user: { sub: string } }) {
    return this.vendorsService.createDeductionNotice(
      dto.vendorId,
      { amountWp: dto.amountWp, reason: dto.reason, orderId: dto.orderId, disputeId: dto.disputeId, nairaSnapshot: dto.nairaSnapshot },
      req.user.sub,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List deductions (admin)' })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('vendorId') vendorId?: string, @Query('status') status?: string) {
    return this.vendorsService.listDeductions({ vendorId, status });
  }

  @Post(':id/apply')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Apply a deduction (after the response window) — debits the vendor' })
  apply(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { sub: string } }) {
    return this.vendorsService.applyDeduction(id, req.user.sub);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Cancel a pending deduction — the vendor is not charged' })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDeductionDto, @Request() req: { user: { sub: string } }) {
    return this.vendorsService.cancelDeduction(id, req.user.sub, dto.reason);
  }

  // ─── Vendor ─────────────────────────────────────────────────────────────────
  @Get('mine')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'The signed-in vendor’s deductions' })
  mine(@Request() req: { user: { sub: string } }) {
    return this.vendorsService.listMyDeductions(req.user.sub);
  }

  @Post(':id/respond')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Respond to a pending deduction notice' })
  respond(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondDeductionDto, @Request() req: { user: { sub: string } }) {
    return this.vendorsService.respondToDeduction(id, req.user.sub, dto.response);
  }
}
