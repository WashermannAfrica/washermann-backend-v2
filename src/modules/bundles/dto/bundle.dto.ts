import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber,
  IsObject, IsOptional, IsString, IsUUID, Min, MaxLength, ValidateNested, IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BundleLineDto {
  @ApiProperty({ enum: ['item', 'category'] })
  @IsEnum(['item', 'category'])
  lineType: 'item' | 'category';

  @ApiPropertyOptional({ description: 'Required when lineType = item' })
  @IsOptional() @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Required when lineType = category' })
  @IsOptional() @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt() @Min(1)
  quantity: number;
}

export class CreateBundleDto {
  @ApiProperty({ example: 'Family Pack' })
  @IsNotEmpty() @IsString() @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  imageUrl?: string;

  @ApiProperty({ type: [BundleLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => BundleLineDto)
  lines: BundleLineDto[];

  @ApiPropertyOptional({ description: 'Apply a promo override' })
  @IsOptional() @IsBoolean()
  isPromo?: boolean;

  @ApiPropertyOptional({ enum: ['percentage', 'fixed'] })
  @IsOptional() @IsEnum(['percentage', 'fixed'])
  promoType?: 'percentage' | 'fixed';

  @ApiPropertyOptional({ description: 'Percent (e.g. 10) or fixed price (₦) per promoType' })
  @IsOptional() @IsNumber()
  promoValue?: number;

  @ApiPropertyOptional({ description: 'ISO 8601 expiry' })
  @IsOptional() @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Audience targeting (null = all users)' })
  @IsOptional() @IsObject()
  audience?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateBundleDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({ type: [BundleLineDto], description: 'If provided, replaces all lines' })
  @IsOptional() @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => BundleLineDto)
  lines?: BundleLineDto[];

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isPromo?: boolean;

  @ApiPropertyOptional({ enum: ['percentage', 'fixed'] })
  @IsOptional() @IsEnum(['percentage', 'fixed'])
  promoType?: 'percentage' | 'fixed';

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  promoValue?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsObject()
  audience?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}
