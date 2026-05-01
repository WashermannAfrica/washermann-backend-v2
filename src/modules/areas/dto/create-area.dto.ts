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
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
