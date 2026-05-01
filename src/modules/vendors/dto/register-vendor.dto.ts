import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  IsArray,
  IsUUID,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Used by admin to create a vendor (new user + vendor record in one call) */
export class RegisterVendorDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: 'vendor@cleaners.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  phone: string;

  @ApiProperty({ example: 'Sparkle Cleaners' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName: string;

  @ApiPropertyOptional({ type: [String], description: 'Area UUIDs the vendor will serve' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMaxSize(20)
  areaIds?: string[];
}
