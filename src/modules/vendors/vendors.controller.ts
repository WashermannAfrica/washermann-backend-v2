import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { RegisterVendorDto } from './dto/register-vendor.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { ProposePricingDto } from './dto/propose-pricing.dto';
import { ApprovePricingDto, RejectPricingDto, DecidePricingItemDto } from './dto/approve-pricing.dto';
import { VerifyVendorDto } from './dto/verify-vendor.dto';
import { SuspendVendorDto } from './dto/suspend-vendor.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { VendorVerificationStatus } from '../../common/enums/vendor-verification-status.enum';

@ApiTags('Vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  // ─── Admin: Create vendor ─────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new vendor account (admin)' })
  create(@Body() dto: RegisterVendorDto, @Request() req: { user: { sub: string } }) {
    return this.vendorsService.adminCreate(dto, req.user.sub);
  }

  // ─── Admin: List vendors ──────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List vendors (admin/finance)' })
  @ApiQuery({ name: 'page',               required: false, type: Number })
  @ApiQuery({ name: 'limit',              required: false, type: Number })
  @ApiQuery({ name: 'search',             required: false, type: String })
  @ApiQuery({ name: 'verificationStatus', required: false, enum: VendorVerificationStatus })
  @ApiQuery({ name: 'isAvailable',        required: false, type: Boolean })
  findAll(
    @Query('page',               new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',              new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search')             search?: string,
    @Query('verificationStatus') verificationStatus?: VendorVerificationStatus,
    @Query('isAvailable')        isAvailable?: string,
  ) {
    return this.vendorsService.findAll({
      page, limit, search, verificationStatus,
      isAvailable: isAvailable === 'true' ? true : isAvailable === 'false' ? false : undefined,
    });
  }

  // ─── Get one vendor ───────────────────────────────────────────────────────────

  @Get(':id')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get vendor by ID (admin/finance)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.findOne(id);
  }

  // ─── Vendor: Get own profile ──────────────────────────────────────────────────

  @Get('me/profile')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get own vendor profile (vendor)' })
  getMyProfile(@Request() req: { user: { sub: string } }) {
    return this.vendorsService.findByUserId(req.user.sub);
  }

  // ─── Vendor: Update own profile ───────────────────────────────────────────────

  @Patch('me/profile')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Update own vendor profile (vendor)' })
  async updateMyProfile(
    @Body() dto: UpdateVendorDto,
    @Request() req: { user: { sub: string } },
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.update(vendor.id, dto);
  }

  @Get('me/pricing')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Own latest pricing proposal (vendor) — for pre-filling the editor' })
  async getMyPricing(@Request() req: { user: { sub: string } }) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.getLatestPricing(vendor.id);
  }

  @Get('me/documents')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Own uploaded KYC documents (vendor) — for the onboarding checklist' })
  async getMyDocuments(@Request() req: { user: { sub: string } }) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.getDocuments(vendor.id);
  }

  // ─── Admin: Update vendor ─────────────────────────────────────────────────────

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a vendor (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVendorDto) {
    return this.vendorsService.update(id, dto);
  }

  // ─── Admin: Verify vendor ─────────────────────────────────────────────────────

  @Post(':id/verify')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Verify or reject a vendor (admin)' })
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyVendorDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.vendorsService.verify(id, dto, req.user.sub);
  }

  // ─── Admin: Suspend vendor ────────────────────────────────────────────────────

  @Post(':id/suspend')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Suspend a vendor (admin)',
    description:
      'Deactivates the vendor and sets them unavailable. Emails/SMSes the vendor to tell ' +
      'them their account was deactivated, including the reason if one is supplied.',
  })
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SuspendVendorDto) {
    return this.vendorsService.updateVerificationStatus(
      id,
      VendorVerificationStatus.SUSPENDED,
      dto?.reason,
    );
  }

  // ─── Documents ────────────────────────────────────────────────────────────────

  @Get(':id/documents')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get vendor documents (admin)' })
  getDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getDocuments(id);
  }

  // ─── Pricing ──────────────────────────────────────────────────────────────────

  @Get('pricing/pending')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'List all pending vendor pricing proposals across vendors (review queue)' })
  listPendingPricing() {
    return this.vendorsService.listPendingPricing();
  }

  @Get(':id/pricing')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get vendor pricing history (admin/finance)' })
  getPricingHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getPricingHistory(id);
  }

  @Get(':id/pricing/active')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get vendor active pricing (admin/finance)' })
  getActivePricing(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getActivePricing(id);
  }

  // ─── Vendor: Propose pricing ──────────────────────────────────────────────────

  @Post('me/pricing')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Propose new pricing (vendor)' })
  async proposePricing(
    @Body() dto: ProposePricingDto,
    @Request() req: { user: { sub: string } },
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.proposePricing(vendor.id, dto);
  }

  // ─── Admin: Per-item decision ─────────────────────────────────────────────────

  @Post('pricing/:pricingId/item-decision')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Approve/reject a single price line in a proposal — immediate, no email (admin)' })
  decidePricingItem(
    @Param('pricingId', ParseUUIDPipe) pricingId: string,
    @Body() dto: DecidePricingItemDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.vendorsService.decidePricingItem(pricingId, dto, req.user.sub);
  }

  // ─── Admin: Approve pricing (finalize — approve all remaining) ──────────────────

  @Post('pricing/:pricingId/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Finalize: approve all remaining lines + email vendor summary (admin)' })
  approvePricing(
    @Param('pricingId', ParseUUIDPipe) pricingId: string,
    @Body() dto: ApprovePricingDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.vendorsService.approvePricing(pricingId, dto, req.user.sub);
  }

  // ─── Admin: Reject pricing ────────────────────────────────────────────────────

  @Post('pricing/:pricingId/reject')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Reject a vendor pricing proposal (admin)' })
  rejectPricing(
    @Param('pricingId', ParseUUIDPipe) pricingId: string,
    @Body() dto: RejectPricingDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.vendorsService.rejectPricing(pricingId, dto, req.user.sub);
  }

  // ─── Wallet ───────────────────────────────────────────────────────────────────

  @Get('me/wallet')
  @Roles(Role.VENDOR)
  @ApiOperation({
    summary: 'Get own vendor wallet, naira-first (vendor)',
    description:
      'Returns the wallet with naira values computed at the vendor\'s effective payout rate ' +
      '(the ₦/WP snapshot locked on their active pricing sheet, or the global payout rate for ' +
      'legacy sheets): balanceNaira, totalEarnedNaira, payoutRateNairaPerWP alongside the raw WP ' +
      'fields. Clients should display ₦ as the primary figure and WP as secondary.',
  })
  async getMyWallet(@Request() req: { user: { sub: string } }) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.getWalletView(vendor.id);
  }

  @Get('me/wallet/ledger')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Get own vendor ledger (vendor)' })
  async getMyLedger(
    @Request() req: { user: { sub: string } },
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const vendor = await this.vendorsService.findByUserId(req.user.sub);
    return this.vendorsService.getLedger(vendor.id, page, limit);
  }

  @Get(':id/wallet')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get vendor earnings wallet, naira-first (admin/finance)' })
  getWallet(@Param('id', ParseUUIDPipe) id: string) {
    return this.vendorsService.getWalletView(id);
  }

  @Get(':id/wallet/ledger')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Get vendor earnings ledger (admin/finance)' })
  getLedger(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.vendorsService.getLedger(id, page, limit);
  }


}
