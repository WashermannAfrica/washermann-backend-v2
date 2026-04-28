import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email or phone number',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({ enum: ['user', 'washerman', 'admin', 'company'], required: false, default: 'user' })
  @IsOptional()
  @IsEnum(['user', 'washerman', 'admin', 'company'])
  source?: string = 'user';
}
