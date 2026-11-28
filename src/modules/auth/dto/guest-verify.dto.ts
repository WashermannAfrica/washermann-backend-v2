import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class GuestVerifyDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({
    example: '123456',
    description:
      'Code sent by SMS. Required when phone verification is enabled; omit it when it is switched off (SMS provider outage).',
  })
  @IsOptional()
  @IsString()
  @Length(4, 8)
  otp?: string;

  @ApiProperty({
    example: true,
    description:
      'Explicit consent to the Privacy Policy and Terms (NDPA). Must be true.',
  })
  @IsBoolean()
  @Equals(true, {
    message: 'You must accept the privacy policy and terms to continue',
  })
  consent: boolean;

  @ApiPropertyOptional({
    description: "The operator's display name (optional)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;
}
