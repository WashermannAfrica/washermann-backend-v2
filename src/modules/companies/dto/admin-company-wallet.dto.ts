import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class AdminCompanyWalletCreditDto {
  @ApiProperty({ description: 'Amount in WashPoints', example: 1000 })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class AdminCompanyWalletDebitDto {
  @ApiProperty({ description: 'Amount in WashPoints', example: 500 })
  @IsInt()
  @IsPositive()
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
