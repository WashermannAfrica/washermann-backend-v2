import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeIssueType, DisputeResolution } from '../../../common/enums/dispute.enum';

export class AffectedItemDto {
  @ApiProperty({ example: 'Dress' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateDisputeDto {
  @ApiProperty({ format: 'uuid', description: 'The order the dispute is about' })
  @IsUUID()
  orderId: string;

  @ApiProperty({ enum: DisputeIssueType })
  @IsEnum(DisputeIssueType)
  issueType: DisputeIssueType;

  @ApiProperty({ example: 'One dress came back with a visible tear near the collar area.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description: string;

  @ApiProperty({ type: [AffectedItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AffectedItemDto)
  affectedItems: AffectedItemDto[];

  @ApiProperty({ enum: DisputeResolution, isArray: true, description: 'Preferred resolution(s)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(DisputeResolution, { each: true })
  preferredResolutions: DisputeResolution[];

  @ApiPropertyOptional({ type: [String], description: 'Evidence image URLs (upload first via POST /upload/dispute-evidence)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  evidenceUrls?: string[];
}
