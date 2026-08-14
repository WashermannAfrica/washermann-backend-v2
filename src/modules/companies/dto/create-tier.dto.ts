import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TierDuration } from '../../../database/entities/tier.entity';

export class CreateTierDto {
  @ApiProperty({ example: 'Senior Staff' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 500, description: 'WashPoints allocated per cycle' })
  @IsInt()
  @Min(0)
  pointsPerCycle: number;

  @ApiProperty({
    example: 4,
    required: false,
    default: 0,
    description: 'Max orders per billing cycle (0 = unlimited). Optional — set later in tier settings if omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyOrderLimit?: number = 0;

  @ApiProperty({
    example: 10,
    required: false,
    default: 0,
    description: 'Max items per order (0 = unlimited). Optional — set later in tier settings if omitted.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  itemLimit?: number = 0;

  @ApiProperty({
    example: 1,
    required: false,
    default: 1,
    description: 'Recurrence interval multiplier for `duration` (e.g. 3 + "daily" = every 3 days).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalCount?: number = 1;

  @ApiProperty({ enum: TierDuration, default: TierDuration.MONTHLY, required: false })
  @IsOptional()
  @IsEnum(TierDuration)
  duration?: TierDuration = TierDuration.MONTHLY;

  @ApiProperty({
    example: 0,
    description: 'Max WP a single worker can spend per cycle (0 = no cap). Changes take effect from the next allocation cycle.',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  spendingCapPerCycle?: number = 0;
}
