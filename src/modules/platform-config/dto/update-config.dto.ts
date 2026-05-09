import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePlatformConfigDto {
  @ApiPropertyOptional({ description: 'Platform price offset %', example: 25, minimum: 0, maximum: 200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(200)
  platformPriceOffsetPercent?: number;

  @ApiPropertyOptional({ description: 'Rep share of order total %', example: 15, minimum: 0, maximum: 50 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  repSharePercent?: number;

  @ApiPropertyOptional({ description: 'Service charge %', example: 5, minimum: 0, maximum: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  serviceChargePercent?: number;

  @ApiPropertyOptional({ description: 'Payout rate: Naira per WP', example: 9, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  payoutRateNairaPerWP?: number;

  @ApiPropertyOptional({ description: 'Rating threshold for auto-flagging reps', example: 3.5, minimum: 1, maximum: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  lowRatingThreshold?: number;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly', 'quarterly'] })
  @IsOptional()
  @IsEnum(['weekly', 'monthly', 'quarterly'])
  bonusCyclePeriod?: 'weekly' | 'monthly' | 'quarterly';

  @ApiPropertyOptional({ description: 'Hours before auto-complete after delivery', example: 24, minimum: 1, maximum: 168 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  orderAutoCompleteHours?: number;

  @ApiPropertyOptional({ description: 'VAT percentage (0 = disabled)', example: 7.5, minimum: 0, maximum: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  vatPercent?: number;

  @ApiPropertyOptional({ description: 'Percentile of vendor prices used for platform price suggestions (50–95)', example: 70, minimum: 50, maximum: 95 })
  @IsOptional()
  @IsInt()
  @Min(50)
  @Max(95)
  priceSuggestionPercentile?: number;
}
