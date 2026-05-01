import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsUUID,
  IsInt,
  MinLength,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRepDto {
  @ApiProperty({ example: 'Amara Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: 'amara@washermann.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  phone: string;

  @ApiPropertyOptional({ type: [String], description: 'Area UUIDs the rep will serve' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(20)
  areaIds?: string[];

  @ApiPropertyOptional({
    description: 'Admin priority rank — lower = higher priority in broadcast queue',
    example: 1,
    minimum: 1,
    maximum: 9999,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9999)
  assignmentPriority?: number;

  @ApiPropertyOptional({ description: 'URL of signed contract document' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contractUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
