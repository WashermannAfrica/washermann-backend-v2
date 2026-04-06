import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'The email or phone the OTP was sent to',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({
    example: '482910',
    description: '6-digit OTP code',
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  @ApiProperty({
    enum: ['email', 'phone'],
    example: 'email',
    description: 'Channel the OTP was sent through',
  })
  @IsNotEmpty()
  @IsIn(['email', 'phone'])
  channel: 'email' | 'phone';
}
