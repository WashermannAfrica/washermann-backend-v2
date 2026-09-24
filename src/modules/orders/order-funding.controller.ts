import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderFundingService } from './order-funding.service';
import { Public } from '../../common/decorators/public.decorator';

class CreateFundingLinkDto {
  @ApiPropertyOptional({ enum: ['self', 'sponsor'], description: "'self' to pay your own order by card, 'sponsor' for a shareable link" })
  @IsOptional() @IsIn(['self', 'sponsor'])
  purpose?: 'self' | 'sponsor';
}

class PayFundingLinkDto {
  @ApiProperty({ description: 'Payer email (for the Paystack receipt)' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Sponsor display name' })
  @IsOptional() @IsString() @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ description: 'Optional message from the sponsor' })
  @IsOptional() @IsString() @MaxLength(500)
  message?: string;
}

@ApiTags('Order funding')
@Controller()
export class OrderFundingController {
  constructor(private readonly fundingService: OrderFundingService) {}

  // ─── Customer: create a funding / sponsor link for a draft order ───────────────

  @Post('orders/:id/funding-link')
  @ApiOperation({ summary: 'Create a per-order payment or shareable sponsor link (customer)' })
  createLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFundingLinkDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.fundingService.createLink(id, req.user.sub, { purpose: dto.purpose });
  }

  // ─── Public: sponsor page ───────────────────────────────────────────────────────

  @Get('funding/:token')
  @Public()
  @ApiOperation({ summary: 'Public view of a funding link (sponsor page)' })
  view(@Param('token') token: string) {
    return this.fundingService.getPublicView(token);
  }

  @Post('funding/:token/pay')
  @Public()
  @ApiOperation({ summary: 'Pay a funding link via Paystack (public — anyone with the link)' })
  pay(@Param('token') token: string, @Body() dto: PayFundingLinkDto) {
    return this.fundingService.pay(token, dto);
  }
}
