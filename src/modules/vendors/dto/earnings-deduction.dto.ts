import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength, MinLength } from 'class-validator';

export class CreateDeductionDto {
  @ApiProperty()
  @IsUUID()
  vendorId: string;

  @ApiProperty({ description: 'WashPoints to deduct from vendor earnings' })
  @IsInt()
  @Min(1)
  amountWp: number;

  @ApiProperty({ example: 'Substantiated damage claim on order WM-3K9F2' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  disputeId?: string;

  @ApiPropertyOptional({ description: 'Naira value at creation (display only)' })
  @IsOptional() @IsNumber() @Min(0)
  nairaSnapshot?: number;
}

export class RespondDeductionDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  response: string;
}

export class CancelDeductionDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  reason?: string;
}
