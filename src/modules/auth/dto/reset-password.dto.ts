import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'The email or phone the reset OTP was sent to',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({
    example: '391047',
    description: '6-digit OTP received via email or SMS',
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiProperty({ example: 'NewStrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
