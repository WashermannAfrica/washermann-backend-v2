import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GameScore } from '../../database/entities/game-score.entity';
import { User } from '../../database/entities/user.entity';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [TypeOrmModule.forFeature([GameScore, User])],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
