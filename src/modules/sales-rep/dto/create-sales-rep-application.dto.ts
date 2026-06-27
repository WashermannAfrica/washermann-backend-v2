import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSalesRepApplicationDto {
  @ApiProperty({ example: 'Ada Obi' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Ikeja' })
  @IsString()
  @MaxLength(100)
  areaOfLagos: string;

  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasSalesExperience?: boolean;

  @ApiPropertyOptional({ example: 'I have a wide network of small businesses in Ikeja.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  whyJoin?: string;
}
