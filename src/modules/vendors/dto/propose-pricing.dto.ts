import { IsArray, ValidateNested, IsString, IsNumber, Min, ArrayMinSize, ArrayMaxSize, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GarmentPriceItemDto {
  @ApiPropertyOptional({ description: 'Catalogue item UUID this price is for (the P70 join key)' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiProperty({ example: 'shirt', description: 'Garment type identifier (legacy free-text)' })
  @IsString()
  garmentType: string;

  @ApiProperty({ example: 800, description: 'Price in Naira (e.g. 800 = ₦800)' })
  @IsNumber()
  @Min(1)
  priceNaira: number;
}

export class ProposePricingDto {
  @ApiProperty({
    type: [GarmentPriceItemDto],
    description: 'Array of garment types and their Naira prices',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GarmentPriceItemDto)
  items: GarmentPriceItemDto[];
}
