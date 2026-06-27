import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from './base.entity';

/**
 * A user's best score for an engagement mini-game (one row per user per game).
 * Powers the in-portal leaderboard.
 */
@Entity('game_scores')
@Index(['game'])
@Index(['userId', 'game'], { unique: true })
export class GameScore extends BaseEntity {
  @ApiProperty()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'sud-tap', description: 'Game identifier' })
  @Column({ type: 'varchar', length: 60 })
  game: string;

  @ApiProperty({ description: "User's best score for this game" })
  @Column({ type: 'int', default: 0 })
  score: number;
}
