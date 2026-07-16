import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * A location (town) is a circle geofence: name + center + radius.
 * Geometry is optional so legacy admin flows (name-only chips) keep working,
 * but geofenced coverage/resolution only considers locations that have it.
 */
export class AddAreaLocationDto {
  @ApiProperty({ example: 'Oniru' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ example: 6.4281, description: 'Geofence center latitude' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat?: number;

  @ApiPropertyOptional({ example: 3.4219, description: 'Geofence center longitude' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng?: number;

  @ApiPropertyOptional({ example: 2.5, description: 'Coverage radius in km' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;
}

export class UpdateAreaLocationDto {
  @ApiPropertyOptional({ example: 'Oniru' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 6.4281 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLat?: number;

  @ApiPropertyOptional({ example: 3.4219 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLng?: number;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm?: number;
}

export class DeactivateAreaDto {
  @ApiPropertyOptional({ example: 'Low demand' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'No active vendors in this area.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
