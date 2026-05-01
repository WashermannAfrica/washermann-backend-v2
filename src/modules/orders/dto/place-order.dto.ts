import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecialItemDto {
  @ApiProperty({ example: 'suit' })
  @IsString()
  type: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class PlaceOrderDto {
  @ApiProperty({ enum: ['wash_fold', 'wash_iron'] })
  @IsEnum(['wash_fold', 'wash_iron'])
  serviceType: 'wash_fold' | 'wash_iron';

  @ApiProperty({ enum: ['small', 'medium', 'large', 'xl'] })
  @IsEnum(['small', 'medium', 'large', 'xl'])
  bagSize: 'small' | 'medium' | 'large' | 'xl';

  @ApiPropertyOptional({ type: [SpecialItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SpecialItemDto)
  specialItems?: SpecialItemDto[];

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ironingCount?: number;

  @ApiProperty({ description: 'UUID of the pickup area' })
  @IsUUID()
  areaId: string;

  @ApiProperty({ description: 'Full pickup address text' })
  @IsString()
  @MaxLength(1000)
  pickupAddress: string;

  @ApiPropertyOptional({ description: 'GPS latitude of pickup address' })
  @IsOptional()
  pickupLatitude?: number;

  @ApiPropertyOptional({ description: 'GPS longitude of pickup address' })
  @IsOptional()
  pickupLongitude?: number;

  @ApiProperty({ description: 'ISO 8601 scheduled pickup datetime' })
  @IsDateString()
  scheduledPickupAt: string;

  @ApiPropertyOptional({ description: 'Special instructions for rep/vendor' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  specialInstructions?: string;

  @ApiPropertyOptional({ description: 'Company ID if paying with company benefit WP' })
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
