import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { VaultPurpose } from '../../../database/entities/vault.entity';

export class CreateVaultDto {
  @ApiProperty({ example: 'Main Vault Q2 2026' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: VaultPurpose, default: VaultPurpose.GENERAL })
  @IsOptional()
  @IsEnum(VaultPurpose)
  purpose?: VaultPurpose;

  @ApiProperty({ example: 10000000, description: 'Total WashPoints this vault can issue. Fixed at creation.' })
  @IsInt()
  @IsPositive()
  totalPoints: number;

  @ApiProperty({ required: false, description: 'Override conversion rate UUID. Defaults to current active rate.' })
  @IsOptional()
  @IsUUID()
  conversionRateId?: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ required: false, description: 'Lower = higher priority in auto-activation sequence' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sequenceOrder?: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  autoCreateOnThreshold?: boolean;

  @ApiProperty({ required: false, description: 'Remaining WP level that triggers auto-creation' })
  @IsOptional()
  @IsInt()
  @Min(0)
  autoCreateThreshold?: number;

  @ApiProperty({ required: false, default: true, description: 'Use same rate for auto-created vault?' })
  @IsOptional()
  @IsBoolean()
  autoCreateUseSameRate?: boolean;

  @ApiProperty({ required: false, description: 'UUID of next vault in manual sequence' })
  @IsOptional()
  @IsUUID()
  nextVaultId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
