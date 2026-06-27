import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';
import { DecimalTransformer } from '../../common/transformers/column.transformers';

/**
 * One submission of the sales-rep onboarding assessment. Unlimited retries;
 * the hard gate is `passed` (score >= pass mark).
 */
@Entity('assessment_attempts')
@Index(['salesRepUserId'])
export class AssessmentAttempt extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'sales_rep_user_id', type: 'uuid' })
  salesRepUserId: string;

  @ApiProperty({ description: 'Number of correct answers' })
  @Column({ type: 'int' })
  score: number;

  @ApiProperty({ description: 'Number of questions graded' })
  @Column({ name: 'total_questions', type: 'int' })
  totalQuestions: number;

  @ApiProperty({ description: 'Score percentage' })
  @Column({ name: 'score_pct', type: 'decimal', precision: 5, scale: 2, transformer: DecimalTransformer })
  scorePct: number;

  @ApiProperty()
  @Column({ type: 'boolean' })
  passed: boolean;

  @ApiProperty({ description: 'Submitted answers: { [questionId]: selectedIndex }' })
  @Column({ type: 'jsonb' })
  answers: Record<string, number>;
}
