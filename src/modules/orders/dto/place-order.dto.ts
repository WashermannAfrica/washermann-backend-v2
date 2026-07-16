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
