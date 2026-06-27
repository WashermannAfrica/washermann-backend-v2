import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsPositive } from 'class-validator';

/**
 * Admin-supplied live economic indicators for a rate calculation.
 * fx = USD/NGN, diesel = ₦/litre, vendor = realised median vendor cost per order.
 */
export class ComputeRateDto {
  @ApiProperty({ example: 1500, description: 'Current USD/NGN exchange rate' })
  @IsNumber()
  @IsPositive()
  fx: number;

  @ApiProperty({ example: 1400, description: 'Current diesel price (₦/litre)' })
  @IsNumber()
  @IsPositive()
  diesel: number;

  @ApiProperty({ example: 5000, description: 'Realised median vendor cost per order (₦)' })
  @IsNumber()
  @IsPositive()
  vendor: number;

  @ApiPropertyOptional({ enum: ['scheduled', 'manual'], default: 'manual' })
  @IsOptional()
  @IsIn(['scheduled', 'manual'])
  trigger?: 'scheduled' | 'manual';
}
