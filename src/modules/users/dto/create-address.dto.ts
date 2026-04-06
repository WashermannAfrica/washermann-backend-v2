import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: '12 Admiralty Way, Lekki Phase 1, Lagos' })
  @IsNotEmpty()
  @IsString()
  addressText: string;

  @ApiPropertyOptional({ example: 6.4281 })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 3.4219 })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: false,
    description: 'Set as the default address',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
