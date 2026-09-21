import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class IssueSuspensionDto {
  @ApiProperty({ enum: ['vendor', 'rep'] })
  @IsIn(['vendor', 'rep'])
  subjectType: 'vendor' | 'rep';

  @ApiProperty({ description: 'Vendor id or Rep id' })
  @IsUUID()
  subjectId: string;

  @ApiProperty()
  @IsString() @MinLength(3) @MaxLength(1000)
  reason: string;
}

export class RespondSuspensionDto {
  @ApiProperty()
  @IsString() @MaxLength(1000)
  response: string;
}

export class RequestReviewDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}

export class ReviewDecisionDto {
  @ApiProperty({ enum: ['upheld', 'overturned'] })
  @IsIn(['upheld', 'overturned'])
  decision: 'upheld' | 'overturned';

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;
}
