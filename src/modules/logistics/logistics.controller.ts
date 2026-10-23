import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, IsUUID, IsDateString, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LogisticsService } from './logistics.service';
import { RepsService } from '../reps/reps.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { Public } from '../../common/decorators/public.decorator';

class RecipientDto {
  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(160) name: string;
  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(40) phone: string;
  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(1000) address: string;
  @ApiProperty() @IsLatitude() latitude: number;
  @ApiProperty() @IsLongitude() longitude: number;
}

class VendorLogisticsDto {
  @ApiProperty({ description: "The vendor's own profile id (must be your vendor account)" })
  @IsUUID() vendorId: string;

  @ApiProperty({ type: RecipientDto })
  @ValidateNested() @Type(() => RecipientDto) recipient: RecipientDto;

  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledPickupAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class CustomerCollectDto {
  @ApiProperty({ description: 'The platform vendor you handed your clothes to' })
  @IsUUID() vendorId: string;

  @ApiProperty() @IsNotEmpty() @IsString() @MaxLength(1000) customerAddress: string;
  @ApiProperty() @IsLatitude() latitude: number;
  @ApiProperty() @IsLongitude() longitude: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() scheduledPickupAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

class PaymentLinkDto {
  @ApiPropertyOptional({ enum: ['self', 'sponsor'], description: "'self' = the requester pays, 'sponsor' = shareable recipient link" })
  @IsOptional() @IsIn(['self', 'sponsor']) purpose?: 'self' | 'sponsor';
}

type Req = { user: { sub: string } };

@ApiTags('Logistics')
@Controller('logistics')
export class LogisticsController {
  constructor(
    private readonly logisticsService: LogisticsService,
    private readonly repsService: RepsService,
  ) {}

  // ─── Vendor-initiated ─────────────────────────────────────────────────────────

  @Post('delivery')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor: request delivery of already-washed clothes to a recipient' })
  delivery(@Body() dto: VendorLogisticsDto, @Request() req: Req) {
    return this.logisticsService.createDelivery(req.user.sub, dto);
  }

  @Post('collect')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: "Vendor: request collection of a recipient's clothes to the shop" })
  collect(@Body() dto: VendorLogisticsDto, @Request() req: Req) {
    return this.logisticsService.createCollect(req.user.sub, dto);
  }

  @Post('round-trip')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor: start a round trip (collect now; mark ready to deliver later)' })
  roundTrip(@Body() dto: VendorLogisticsDto, @Request() req: Req) {
    return this.logisticsService.createRoundTrip(req.user.sub, dto);
  }

  @Post(':id/ready-to-deliver')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor: mark a round-trip collect leg ready — spawns the delivery leg' })
  ready(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.logisticsService.markReadyToDeliver(id, req.user.sub);
  }

  // ─── Customer-initiated ───────────────────────────────────────────────────────

  @Post('customer-collect')
  @ApiOperation({ summary: 'Customer: collect clothes you handed to a platform vendor off-app' })
  customerCollect(@Body() dto: CustomerCollectDto, @Request() req: Req) {
    return this.logisticsService.createCustomerCollect(req.user.sub, dto);
  }

  // ─── Payment ──────────────────────────────────────────────────────────────────

  @Post(':id/pay-wallet')
  @ApiOperation({ summary: 'Pay a logistics leg from your WashPoints wallet (customer flow)' })
  payWallet(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.logisticsService.payFromWallet(id, req.user.sub);
  }

  @Post(':id/payment-link')
  @ApiOperation({ summary: 'Create a card payment link for a logistics leg (vendor pays or recipient link)' })
  paymentLink(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PaymentLinkDto, @Request() req: Req) {
    return this.logisticsService.createPaymentLink(id, req.user.sub, dto.purpose ?? 'self');
  }

  // ─── Rep leg actions ──────────────────────────────────────────────────────────

  @Post(':id/picked-up')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep: mark the leg picked up at origin' })
  async pickedUp(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    const rep = await this.repsService.findByUserId(req.user.sub);
    return this.logisticsService.repPickedUp(id, rep.id);
  }

  @Post(':id/delivered')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep: mark the leg delivered at destination (settles the leg)' })
  async delivered(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    const rep = await this.repsService.findByUserId(req.user.sub);
    return this.logisticsService.repDelivered(id, rep.id);
  }

  // ─── Public tracking ──────────────────────────────────────────────────────────

  @Get('track/:token')
  @Public()
  @ApiOperation({ summary: 'Public: track a logistics leg by its recipient tracking token' })
  track(@Param('token') token: string) {
    return this.logisticsService.trackByToken(token);
  }
}
