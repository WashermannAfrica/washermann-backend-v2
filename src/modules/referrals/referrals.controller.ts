import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsNumber, IsOptional, IsBoolean, IsString } from 'class-validator';
import { ReferralsService } from './referrals.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

class UpsertRewardRuleDto {
  @IsIn(['sales_rep', 'rep', 'customer', 'vendor']) referrerType: 'sales_rep' | 'rep' | 'customer' | 'vendor';
  @IsIn(['customer', 'vendor']) referredType: 'customer' | 'vendor';
  @IsOptional() @IsEnum(['fixed', 'percent']) kind?: 'fixed' | 'percent';
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsNumber() vendorApprovalBonus?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class RejectReferralDto {
  @IsOptional() @IsString() note?: string;
}

class AdjustReferralDto {
  @IsNumber() rewardAmount: number;
  @IsOptional() @IsString() note?: string;
}

@ApiTags('Referrals')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly service: ReferralsService) {}

  @Public()
  @Get('validate')
  @ApiOperation({ summary: 'Validate a referral code (public — used at signup)' })
  validate(@Query('code') code: string) {
    return this.service.validate(code ?? '');
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My referral code, referrals and payout summary' })
  me(@CurrentUser('id') userId: string) {
    return this.service.myReferrals(userId);
  }

  @Get('summary')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: referral portfolio summary + outstanding liability' })
  summary() {
    return this.service.summary();
  }

  @Get('rules')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: reward rules (CAC config)' })
  rules() {
    return this.service.listRules();
  }

  @Put('rules')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: create/update a reward rule' })
  upsertRule(@Body() dto: UpsertRewardRuleDto) {
    return this.service.upsertRule(dto as any);
  }

  @Get()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: all referrals (filter: status, referrerType, referredType)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'referrerType', required: false })
  @ApiQuery({ name: 'referredType', required: false })
  list(
    @Query('status') status?: string,
    @Query('referrerType') referrerType?: string,
    @Query('referredType') referredType?: string,
  ) {
    return this.service.listReferrals({ status, referrerType, referredType });
  }

  @Post(':id/reject')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: flag/reject a referral (fraud); cannot reject a paid one' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectReferralDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.rejectReferral(id, adminId, dto.note);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: manually adjust a referral reward amount (audited)' })
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustReferralDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.adjustReferral(id, adminId, dto.rewardAmount, dto.note);
  }
}
