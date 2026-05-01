import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePriceListEntryDto {
  @ApiProperty({ enum: ['bag', 'special_item', 'ironing'] })
  @IsEnum(['bag', 'special_item', 'ironing'])
  priceType: 'bag' | 'special_item' | 'ironing';

  @ApiPropertyOptional({ enum: ['wash_fold', 'wash_iron'] })
  @IsOptional()
  @IsEnum(['wash_fold', 'wash_iron'])
  serviceType?: 'wash_fold' | 'wash_iron';

  @ApiPropertyOptional({ enum: ['small', 'medium', 'large', 'xl'] })
  @IsOptional()
  @IsEnum(['small', 'medium', 'large', 'xl'])
  bagSize?: 'small' | 'medium' | 'large' | 'xl';

  @ApiPropertyOptional({ description: 'Item type for special_item entries', example: 'suit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  itemType?: string;

  @ApiProperty({ description: 'Price in WashPoints', example: 1000, minimum: 1 })
  @IsInt()
  @Min(1)
  priceWP: number;

  @ApiPropertyOptional({ example: 'Medium Bag — Wash & Fold' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 datetime for effectiveFrom', example: '2026-05-02T00:00:00Z' })
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class UpdateBonusTierDto {
  @ApiProperty({ example: 'Gold' })
  @IsString()
  @MaxLength(100)
  label: string;

  @ApiProperty({ example: 4.5, minimum: 0, maximum: 5 })
  @IsInt()
  minRating: number;

  @ApiProperty({ example: 4.7, minimum: 0, maximum: 5 })
  @IsInt()
  maxRating: number;

  @ApiProperty({ example: 10, minimum: 0 })
  @IsInt()
  @Min(0)
  bonusPercent: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  flagReview?: boolean;
}
