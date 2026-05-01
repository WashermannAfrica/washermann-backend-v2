import { IsArray, ValidateNested, IsString, IsNumber, Min, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class GarmentPriceItemDto {
  @ApiProperty({ example: 'shirt', description: 'Garment type identifier' })
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
