import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class ActivateDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email or phone number of the pre-created account',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({
    example: 'John Doe',
    required: false,
    description: 'Required only if full name was not set during pre-creation',
  })
  @IsOptional()
  @IsString()
  fullName?: string;
}
