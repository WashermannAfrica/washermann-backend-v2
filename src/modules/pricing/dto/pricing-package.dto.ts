import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PackageAudience, PackageCriteriaItem } from '../../../database/entities/pricing-package.entity';

export class CreatePricingPackageDto {
  @ApiProperty({ example: 'Baby Bundle' })
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Perfect for newborns — up to 15 baby garments gently washed and folded.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Cloudinary or CDN URL for package artwork' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string;

  @ApiProperty({ description: 'Fixed WashPoints price for this entire package', example: 800, minimum: 1 })
  @IsInt()
  @Min(1)
  priceWP: number;

  @ApiPropertyOptional({
    description: 'Structured breakdown of what is included. Each item: { label, garmentType?, quantity? }',
    type: 'array',
  })
  @IsOptional()
  @IsArray()
  criteria?: PackageCriteriaItem[];

  @ApiPropertyOptional({
    description: 'Audience targeting rules. Omit or set allUsers:true for everyone.',
  })
  @IsOptional()
  @IsObject()
  audience?: PackageAudience;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Sort order — lower = shown first', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'ISO 8601 — package becomes available from this date' })
  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 — package expires after this date' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiPropertyOptional({ description: 'Max times a single user can redeem this package (null = unlimited)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerUser?: number;
}

export class UpdatePricingPackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imageUrl?: string | null;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceWP?: number;

  @ApiPropertyOptional({ type: 'array' })
  @IsOptional()
  @IsArray()
  criteria?: PackageCriteriaItem[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  audience?: PackageAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxUsesPerUser?: number | null;
}

export class ApplyIntelligenceSuggestionsDto {
  @ApiPropertyOptional({
    description: 'Limit application to these garment types only. Omit to apply all.',
    type: [String],
    example: ['shirt', 'suit'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  garmentTypes?: string[];

  @ApiPropertyOptional({
    description: 'Skip entries where |diffWP| ≤ this threshold (avoids tiny noise updates). Default 0.',
    example: 5,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  toleranceWP?: number;
}
