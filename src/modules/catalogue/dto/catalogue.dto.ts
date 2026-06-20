import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, MaxLength,
} from 'class-validator';

// ─── Category ─────────────────────────────────────────────────────────────────
export class CreateCategoryDto {
  @ApiProperty({ example: 'Tops' })
  @IsNotEmpty() @IsString() @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'SVG markup or asset URL' })
  @IsOptional() @IsString()
  svgIcon?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({ description: 'Enable/disable the category' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ─── Sub-category ─────────────────────────────────────────────────────────────
export class CreateSubCategoryDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'Casual Tops' })
  @IsNotEmpty() @IsString() @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateSubCategoryDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ─── Item ─────────────────────────────────────────────────────────────────────
export class CreateItemDto {
  @ApiProperty()
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  subCategoryId?: string;

  @ApiProperty({ example: 'Dress Shirt' })
  @IsNotEmpty() @IsString() @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: 'SVG markup or asset URL' })
  @IsOptional() @IsString()
  svgIcon?: string;

  @ApiPropertyOptional({ description: 'Eligible for Wash & Fold bags' })
  @IsOptional() @IsBoolean()
  isEveryday?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @ApiPropertyOptional({ description: 'Enable/disable the item' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// ─── Suggestions ──────────────────────────────────────────────────────────────
export class CreateSuggestionDto {
  @ApiProperty({ example: 'Ankara Gown', description: 'The item a vendor offers that is not in the catalogue' })
  @IsNotEmpty() @IsString() @MaxLength(300)
  rawText: string;

  @ApiPropertyOptional({ description: 'Price the vendor proposes (₦)' })
  @IsOptional()
  proposedPriceNaira?: number;
}

export class ApproveSuggestionDto {
  @ApiProperty({ description: 'Category to file the new item under' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  subCategoryId?: string;

  @ApiPropertyOptional({ description: 'Override the item name (defaults to the raw text)' })
  @IsOptional() @IsString() @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Mark the new item as everyday' })
  @IsOptional() @IsBoolean()
  isEveryday?: boolean;

  @ApiPropertyOptional({ description: 'Merge into this existing item instead of creating a new one' })
  @IsOptional() @IsUUID()
  mergeIntoItemId?: string;
}

export class RejectSuggestionDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;
}
