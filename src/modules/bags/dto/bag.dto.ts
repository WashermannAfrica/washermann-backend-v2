import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, MaxLength,
} from 'class-validator';

export class CreateBagDto {
  @ApiProperty({ example: 'Medium Bag' })
  @IsNotEmpty() @IsString() @MaxLength(160)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 10, description: 'Number of items the bag holds' })
  @IsInt() @Min(1)
  allowedItemCount: number;

  @ApiPropertyOptional({ type: [String], description: 'Eligible item UUIDs (operational guidance)' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  eligibleItemIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Eligible category UUIDs (operational guidance)' })
  @IsOptional() @IsArray() @IsUUID('all', { each: true })
  eligibleCategoryIds?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}

export class UpdateBagDto extends PartialType(CreateBagDto) {
  @ApiPropertyOptional({ description: 'Enable/disable the bag' })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
