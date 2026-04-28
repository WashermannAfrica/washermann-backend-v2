import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

export class CreateGiftCardDto {
  @ApiProperty({ example: 500, description: 'WashPoints per redemption' })
  @IsInt()
  @IsPositive()
  wpValuePerUse: number;

  @ApiProperty({ example: 1, description: 'Max number of redemptions (WP debited = wpValuePerUse * maxUsages)' })
  @IsInt()
  @IsPositive()
  @Max(10000)
  maxUsages: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({ required: false, description: 'Qualification criteria JSON e.g. { "employeeOnly": true }' })
  @IsOptional()
  @IsObject()
  qualificationCriteria?: Record<string, any>;

  @ApiProperty({ required: false, default: true, description: 'For company gift cards: allow non-employee redemption?' })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ required: false, description: 'Admin only: designate a specific vault UUID (defaults to active vault)' })
  @IsOptional()
  @IsUUID()
  vaultId?: string;
}
