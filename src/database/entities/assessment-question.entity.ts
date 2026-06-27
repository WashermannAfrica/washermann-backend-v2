import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * A multiple-choice question in the sales-rep onboarding assessment.
 * Admin-editable bank (seeded with placeholders). `correctIndex` is never
 * exposed to the rep — only to grading.
 */
@Entity('assessment_questions')
export class AssessmentQuestion extends BaseEntity {
  @ApiProperty()
  @Column({ type: 'text' })
  prompt: string;

  @ApiProperty({ type: [String], description: 'Answer options' })
  @Column({ type: 'jsonb' })
  options: string[];

  @ApiProperty({ description: 'Index (0-based) of the correct option' })
  @Column({ name: 'correct_index', type: 'int' })
  correctIndex: number;

  @ApiProperty()
  @Column({ type: 'boolean', default: true })
  active: boolean;
}
