import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { GameScore } from '../../database/entities/game-score.entity';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class GamesService {
  constructor(
    @InjectRepository(GameScore) private scores: Repository<GameScore>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  /** Record a score — only keeps the user's best for that game. */
  async submitScore(userId: string, game: string, score: number) {
    const existing = await this.scores.findOne({ where: { userId, game } });
    if (!existing) {
      const saved = await this.scores.save(this.scores.create({ userId, game, score }));
      return { best: saved.score, improved: true };
    }
    if (score > existing.score) {
      existing.score = score;
      await this.scores.save(existing);
      return { best: score, improved: true };
    }
    return { best: existing.score, improved: false };
  }

  async leaderboard(game: string, userId: string, limit = 10) {
    const top = await this.scores.find({
      where: { game },
      order: { score: 'DESC', updatedAt: 'ASC' },
      take: Math.min(50, Math.max(1, limit)),
    });
    const ids = top.map((t) => t.userId);
    const users = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    const mine = await this.scores.findOne({ where: { userId, game } });
    let me: { rank: number; score: number } | null = null;
    if (mine) {
      const better = await this.scores.count({ where: { game, score: MoreThan(mine.score) } });
      me = { rank: better + 1, score: mine.score };
    }

    return {
      top: top.map((t, i) => ({
        rank: i + 1,
        name: byId.get(t.userId)?.fullName ?? 'Vendor',
        score: t.score,
        isMe: t.userId === userId,
      })),
      me,
      players: await this.scores.count({ where: { game } }),
    };
  }
}
