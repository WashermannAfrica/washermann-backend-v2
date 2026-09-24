import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class HoldPayoutDto {
  @ApiProperty({ description: 'Why the payout is being withheld for investigation', example: 'Open garment-damage claim on order WM-3K9F2' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
