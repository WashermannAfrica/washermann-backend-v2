import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterCompanyDto {
  // Step 1 — Company Info
  @ApiProperty({ example: 'Acme Corp Ltd' })
  @IsNotEmpty()
  @IsString()
  companyName: string;

  @ApiProperty({ example: 'Technology' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({ example: '500' })
  @IsOptional()
  @IsString()
  numberOfWorkers?: string;

  // Step 2 — Contact
  @ApiProperty({ example: 'admin@acmecorp.com' })
  @IsEmail()
  companyEmail: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '23 Commerce Drive, Ikeja' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'https://acmecorp.com' })
  @IsOptional()
  @IsString()
  website?: string;

  // Step 3 — Account
  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  contactPersonName: string;

  @ApiProperty({ example: 'john@acmecorp.com' })
  @IsEmail()
  contactPersonEmail: string;

  @ApiProperty({ example: '+2348099999999' })
  @IsOptional()
  @IsString()
  contactPersonPhone?: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: 'Password must contain uppercase, lowercase and number' })
  password: string;
}
