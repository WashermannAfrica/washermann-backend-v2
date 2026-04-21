import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateConversionRateDto {
  @ApiProperty({
    example: 'NGN',
    description: 'ISO 4217 currency code',
    default: 'NGN',
  })
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiProperty({
    example: 2.0,
    description: 'WashPoints issued per 1 major currency unit (e.g. per ₦1). Min 0.0001.',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100000)
  pointsPerUnit: number;

  @ApiProperty({
    description:
      'Answer to the admin security question. Must match RATE_CHANGE_SECURITY_ANSWER_HASH in env.',
  })
  @IsNotEmpty()
  @IsString()
  securityAnswer: string;

  @ApiProperty({
    example: 'Seasonal promo rate for Q2',
    required: false,
    description: 'Optional reason / audit note for this rate change',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
