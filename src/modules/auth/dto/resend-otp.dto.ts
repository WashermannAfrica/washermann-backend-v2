import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ResendOtpDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email or phone number to resend OTP to',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({
    enum: ['verification', 'reset'],
    example: 'verification',
    description: 'Purpose of the OTP',
  })
  @IsNotEmpty()
  @IsIn(['verification', 'reset'])
  purpose: 'verification' | 'reset';
}
