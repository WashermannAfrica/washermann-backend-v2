import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class InitiateTopupDto {
  @ApiProperty({
    example: 500,
    description: 'Amount in Naira (whole number). Converted to kobo internally.',
  })
  @IsInt()
  @Min(1)
  amountNaira: number;

  @ApiProperty({
    example: 'NGN',
    default: 'NGN',
    required: false,
    description: 'ISO 4217 currency code. Only NGN is active in this release.',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}
