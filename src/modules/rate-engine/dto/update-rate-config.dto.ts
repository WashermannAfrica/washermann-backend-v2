import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

class FactorTripletDto {
  @ApiPropertyOptional() @IsNumber() @IsPositive() fx: number;
  @ApiPropertyOptional() @IsNumber() @IsPositive() diesel: number;
  @ApiPropertyOptional() @IsNumber() @IsPositive() vendor: number;
}

export class UpdateRateConfigDto {
  @ApiPropertyOptional({ description: 'EMA smoothing constant (0–1)' })
  @IsOptional() @IsNumber() @Min(0.01) @Max(1)
  alpha?: number;

  @ApiPropertyOptional({ description: 'Monthly movement cap (percent)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  capPct?: number;

  @ApiPropertyOptional({ description: 'Deadband (percent)' })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  deadbandPct?: number;

  @ApiPropertyOptional({ description: 'Discretisation step (₦)' })
  @IsOptional() @IsNumber() @IsPositive()
  stepNaira?: number;

  @ApiPropertyOptional({ description: 'Top-up (buy) spread on V' })
  @IsOptional() @IsNumber() @Min(0) @Max(1)
  buySpread?: number;

  @ApiPropertyOptional({ description: 'Payout spread on V' })
  @IsOptional() @IsNumber() @Min(0) @Max(1)
  payoutSpread?: number;

  @ApiPropertyOptional({ description: 'Factor weights; must sum to 1' })
  @IsOptional() @ValidateNested() @Type(() => FactorTripletDto)
  weights?: FactorTripletDto;

  @ApiPropertyOptional({ description: 'Factor baselines (launch reference values)' })
  @IsOptional() @ValidateNested() @Type(() => FactorTripletDto)
  baselines?: FactorTripletDto;
}
