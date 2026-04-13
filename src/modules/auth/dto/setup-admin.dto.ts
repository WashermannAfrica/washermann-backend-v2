import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class SetupAdminDto {
  @ApiProperty({ description: 'Setup secret (must match ADMIN_SETUP_SECRET env var)' })
  @IsNotEmpty()
  @IsString()
  setupSecret: string;

  @ApiProperty({ example: 'Super Admin' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'admin@washermann.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @ApiProperty({ example: 'SuperStr0ngP@ss', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;
}
