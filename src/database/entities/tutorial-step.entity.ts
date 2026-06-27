import { Column, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * An onboarding tutorial step shown to a sales rep before the assessment.
 * Admin-editable content (seeded with placeholders).
 */
@Entity('tutorial_steps')
export class TutorialStep extends BaseEntity {
  @ApiProperty({ description: 'Display order (ascending)' })
  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;

  @ApiProperty()
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @ApiProperty()
  @Column({ type: 'text' })
  body: string;

  @ApiProperty()
  @Column({ type: 'boolean', default: true })
  active: boolean;
}
