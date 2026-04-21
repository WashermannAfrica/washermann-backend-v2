import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AdminDebitDto {
  @ApiProperty({ example: 200, description: 'WashPoints to debit' })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Manual correction for duplicate top-up' })
  @IsNotEmpty()
  @IsString()
  description: string;
}
