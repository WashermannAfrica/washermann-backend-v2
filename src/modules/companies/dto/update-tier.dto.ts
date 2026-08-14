import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TierDuration } from '../../../database/entities/tier.entity';

export class UpdateTierDto {
  @ApiProperty({ example: 'Senior Staff', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    example: 500,
    required: false,
    description: 'WashPoints allocated per cycle. Changes take effect from the next allocation cycle.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsPerCycle?: number;

  @ApiProperty({ example: 4, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyOrderLimit?: number;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  itemLimit?: number;

  @ApiProperty({
    example: 1,
    required: false,
    description: 'Recurrence interval multiplier for `duration` (e.g. 3 + "daily" = every 3 days).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalCount?: number;

  @ApiProperty({ enum: TierDuration, required: false })
  @IsOptional()
  @IsEnum(TierDuration)
  duration?: TierDuration;

  @ApiProperty({
    example: 0,
    required: false,
    description: 'Max WP a single worker can spend per cycle (0 = no cap). Changes take effect from the next allocation cycle.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  spendingCapPerCycle?: number;
}
