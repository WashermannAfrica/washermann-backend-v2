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

  @ApiProperty({ example: 4, description: 'Max orders per billing cycle' })
  @IsInt()
  @Min(0)
  monthlyOrderLimit: number;

  @ApiProperty({ example: 10, description: 'Max items per order' })
  @IsInt()
  @Min(1)
  itemLimit: number;

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
