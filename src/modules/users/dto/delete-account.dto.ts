import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Self-service account deletion — re-confirm with the current password. */
export class DeleteAccountDto {
  @ApiProperty({ description: 'Current password, to confirm it is really you' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ required: false, description: 'Optional reason (for our records)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Admin: suspend or reactivate an account (not deletion). */
export class UpdateUserStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'], description: 'active = reactivate, suspended = block sign-in' })
  @IsIn(['active', 'suspended'])
  status: 'active' | 'suspended';
}
