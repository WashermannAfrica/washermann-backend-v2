import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWashRepApplicationDto {
  @ApiProperty({ example: 'Tunde Bello' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @MinLength(7)
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'tunde@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Ikeja', description: 'LGA / area of Lagos' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  areaOfLagos: string;

  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @IsString()
  @MinLength(4)
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  workedLogistics: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  workedLaundromat: boolean;
}
