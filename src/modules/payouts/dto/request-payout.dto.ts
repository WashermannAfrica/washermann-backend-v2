import { IsInt, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestPayoutDto {
  @ApiProperty({ description: 'WashPoints amount to payout', minimum: 1 })
  @IsInt()
  @Min(1)
  amountWP: number;

  @ApiProperty({ example: '044', description: 'Paystack bank code' })
  @IsString()
  @MaxLength(20)
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @MaxLength(20)
  accountNumber: string;

  @ApiProperty({ example: 'Sparkle Cleaners Ltd' })
  @IsString()
  @MaxLength(255)
  accountName: string;
}
