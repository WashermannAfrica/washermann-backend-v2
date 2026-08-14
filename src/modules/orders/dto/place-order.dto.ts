import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemSelectionDto {
  @ApiProperty({ description: 'Catalogue item UUID' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

/**
 * One flow per order:
 *  - wash_fold → set `bagId`
 *  - wash_iron → set `selections`
 *  - bundle    → set `bundleId` (Phase 4)
 * Cross-field requirements are validated in the service.
 */
export class PlaceOrderDto {
  @ApiProperty({ enum: ['wash_fold', 'wash_iron', 'bundle'] })
  @IsEnum(['wash_fold', 'wash_iron', 'bundle'])
  flow: 'wash_fold' | 'wash_iron' | 'bundle';

  @ApiPropertyOptional({ description: 'Bag UUID — required for wash_fold' })
  @IsOptional()
  @IsUUID()
  bagId?: string;

  @ApiPropertyOptional({ type: [OrderItemSelectionDto], description: 'Required for wash_iron' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OrderItemSelectionDto)
  selections?: OrderItemSelectionDto[];

  @ApiPropertyOptional({ description: 'Bundle UUID — required for bundle' })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiPropertyOptional({
    description:
      'UUID of the pickup area. Optional — the area is DERIVED server-side from the ' +
      'pickup coordinates; this is only a fallback if geofencing cannot resolve a point.',
  })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiProperty({ description: 'Full pickup address text' })
  @IsString()
  @MaxLength(1000)
  pickupAddress: string;

  @ApiProperty({ description: 'GPS latitude of the pickup address — required; used to match the service area' })
  @IsNotEmpty()
  @IsLatitude()
  pickupLatitude: number;

  @ApiProperty({ description: 'GPS longitude of the pickup address — required; used to match the service area' })
  @IsNotEmpty()
  @IsLongitude()
  pickupLongitude: number;

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
