import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SubmitAssessmentDto {
  @ApiProperty({
    description: 'Map of question id → selected option index',
    example: { 'a1b2...': 0, 'c3d4...': 2 },
  })
  @IsObject()
  answers: Record<string, number>;
}
