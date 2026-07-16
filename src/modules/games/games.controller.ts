import { Body, Controller, DefaultValuePipe, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { GamesService } from './games.service';
import { SubmitScoreDto } from './dto/submit-score.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
export class GamesController {
  constructor(private readonly service: GamesService) {}

  @Post('scores')
  @ApiOperation({ summary: 'Submit a game score (keeps your best)' })
  submit(@Body() dto: SubmitScoreDto, @CurrentUser('id') userId: string) {
    return this.service.submitScore(userId, dto.game, dto.score);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Leaderboard for a game + your rank' })
  @ApiQuery({ name: 'game', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  leaderboard(
    @Query('game') game: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.leaderboard(game, userId, limit);
  }
}
