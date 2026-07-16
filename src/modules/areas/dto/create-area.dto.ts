import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsInt,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AddAreaLocationDto } from './area-location.dto';

export class CreateAreaDto {
  @ApiProperty({ example: 'Lekki Phase 1' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;

  @ApiPropertyOptional({ example: 'Eti-Osa' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lga?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Ordered list of adjacent area UUIDs (closest first)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(20)
  adjacentAreaIds?: string[];

  @ApiProperty({
    description: 'Flat transport fee in WashPoints',
    example: 150,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  transportFeeWP: number;

  @ApiPropertyOptional({ description: 'Target number of users for this area', example: 500, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  targetUsers?: number;

  @ApiPropertyOptional({
    description: 'Towns/locations within the area — each a circle geofence (name + center + radius)',
    type: [AddAreaLocationDto],
    example: [{ name: 'Oniru', centerLat: 6.4281, centerLng: 3.4219, radiusKm: 2.5 }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddAreaLocationDto)
  @ArrayMaxSize(50)
  locations?: AddAreaLocationDto[];
}
