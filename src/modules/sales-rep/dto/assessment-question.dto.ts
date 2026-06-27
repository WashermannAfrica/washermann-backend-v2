import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAssessmentQuestionDto {
  @ApiProperty({ example: 'When does a customer referral become payable?' })
  @IsString()
  @MinLength(2)
  prompt: string;

  @ApiProperty({ type: [String], example: ['At signup', 'After first completed order', 'After 30 days'] })
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  options: string[];

  @ApiProperty({ example: 1, description: '0-based index of the correct option' })
  @IsInt()
  @Min(0)
  correctIndex: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateAssessmentQuestionDto extends PartialType(CreateAssessmentQuestionDto) {}
