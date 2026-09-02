import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeResolution, DisputeStatus } from '../../../common/enums/dispute.enum';

/** Admin/resolver: move a dispute along its timeline (under_review / investigating). */
export class UpdateDisputeStatusDto {
  @ApiProperty({ enum: [DisputeStatus.UNDER_REVIEW, DisputeStatus.INVESTIGATING] })
  @IsEnum(DisputeStatus)
  status: DisputeStatus;

  @ApiPropertyOptional({ description: 'Note shown on the customer-facing timeline' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Admin/resolver: close a dispute with an outcome. */
export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeResolution, description: 'The outcome granted (omit for a rejection)' })
  @IsOptional()
  @IsEnum(DisputeResolution)
  outcome?: DisputeResolution;

  @ApiProperty({ example: false, description: 'Set true to reject the dispute instead of granting an outcome' })
  @IsOptional()
  reject?: boolean;

  @ApiPropertyOptional({ description: 'Resolution note shown to the customer' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'WashPoints to credit the customer as part of the resolution (refund/compensation)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  refundWP?: number;
}
