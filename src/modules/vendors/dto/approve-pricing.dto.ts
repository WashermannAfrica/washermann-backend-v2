import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovePricingDto {
  @ApiProperty({
    description: 'ISO 8601 datetime when this pricing becomes effective',
    example: '2026-05-02T00:00:00Z',
  })
  @IsDateString()
  effectiveFrom: string;
}

export class RejectPricingDto {
  @ApiProperty({ description: 'Reason for rejection (required so vendor can correct)' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
