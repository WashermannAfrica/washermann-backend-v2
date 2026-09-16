import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One counted line in a garment log — a catalogue item + how many were seen. */
export class GarmentLogItemDto {
  @ApiProperty({ description: 'Catalogue item id (from GET /catalogue).', format: 'uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'How many of this item were counted.', example: 5 })
  @IsInt()
  @Min(1)
  count: number;
}

export class LogGarmentCountDto {
  /**
   * Preferred: the rep selects catalogue items from the fetched list and the app
   * sends their ids. Ids are validated against the catalogue, priced against the
   * order's vendor, and (when the vendor hasn't priced an item) fall back to the
   * system median (P50) with the gap flagged to the vendor and admin.
   */
  @ApiPropertyOptional({
    type: [GarmentLogItemDto],
    description: 'Catalogue items the rep counted, each { itemId, count }.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GarmentLogItemDto)
  items?: GarmentLogItemDto[];

  /**
   * Legacy free-text map { garmentType: count }. Retained so older app builds keep
   * working; new clients should send `items`. Priced by garment-type string match.
   */
  @ApiPropertyOptional({
    description: 'Legacy free-text map { garmentType: count }. Prefer `items`.',
    example: { shirt: 15, trouser: 8 },
  })
  @IsOptional()
  @IsObject()
  garmentLog?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Optional rep note about the pickup.' })
  @IsOptional()
  @IsString()
  note?: string;
}
