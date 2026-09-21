import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsBoolean,
  IsLatitude,
  IsLongitude,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVendorDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(20)
  areaIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Shop latitude (admin backfill)' })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Shop longitude (admin backfill)' })
  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
