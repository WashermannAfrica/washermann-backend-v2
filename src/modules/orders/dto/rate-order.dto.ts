import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RateOrderDto {
  @ApiPropertyOptional({ description: 'Rep logistics rating (1–5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  repScore?: number;

  @ApiPropertyOptional({ description: 'Vendor laundry quality rating (1–5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  vendorScore?: number;

  @ApiPropertyOptional({ description: 'Optional text comment', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
