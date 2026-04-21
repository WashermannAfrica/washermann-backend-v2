import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class AdminCreditDto {
  @ApiProperty({ example: 500, description: 'WashPoints to credit' })
  @IsInt()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Goodwill compensation for failed order #123' })
  @IsNotEmpty()
  @IsString()
  description: string;
}
