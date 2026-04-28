import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GiftCardsService } from './gift-cards.service';
import { CreateGiftCardDto } from './dto/create-gift-card.dto';
import { RedeemGiftCardDto } from './dto/redeem-gift-card.dto';
import { GiftCardStatus } from '../../database/entities/gift-card.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Gift Cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class GiftCardsController {
  constructor(private readonly giftCardsService: GiftCardsService) {}

  // ─── Admin endpoints ──────────────────────────────────────────────────────────

  @Roles(Role.ADMIN)
  @Post('admin/gift-cards')
  @ApiOperation({ summary: 'Create a gift card (Admin — debits vault)' })
  createAdmin(@Body() dto: CreateGiftCardDto, @CurrentUser('id') adminId: string) {
    return this.giftCardsService.createAdminGiftCard(dto, adminId);
  }

  @Roles(Role.ADMIN)
  @Get('admin/gift-cards')
  @ApiOperation({ summary: 'List all gift cards (Admin)' })
  listAdmin(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: GiftCardStatus,
  ) {
    return this.giftCardsService.listAdminGiftCards(Number(page), Number(limit), status);
  }

  @Roles(Role.ADMIN)
  @Delete('admin/gift-cards/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a gift card (Admin)' })
  revokeAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.giftCardsService.revokeGiftCard(id, adminId, true);
  }

  // ─── User redeem ──────────────────────────────────────────────────────────────

  @Post('gift-cards/redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a gift card code' })
  redeem(@Body() dto: RedeemGiftCardDto, @CurrentUser('id') userId: string) {
    return this.giftCardsService.redeemGiftCard(dto.code, userId);
  }
}
