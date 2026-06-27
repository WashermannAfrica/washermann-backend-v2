import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovePricingDto {
  @ApiPropertyOptional({
    description: 'ISO 8601 datetime when this pricing becomes effective (defaults to now)',
    example: '2026-05-02T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class RejectPricingDto {
  @ApiProperty({ description: 'Reason for rejection (required so vendor can correct)' })
  @IsString()
  @MaxLength(1000)
  reason: string;
}

/** Per-line approve/reject inside a proposal — takes effect immediately, no email. */
export class DecidePricingItemDto {
  @ApiProperty({ description: 'Item key: catalogue itemId, or "gt:<garmentType>" for legacy lines' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  itemKey: string;

  @ApiProperty({ enum: ['approved', 'rejected'], description: 'Decision for this single price line' })
  @IsIn(['approved', 'rejected'])
  decision: 'approved' | 'rejected';

  @ApiPropertyOptional({ description: 'Reason — required when decision is "rejected"' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
