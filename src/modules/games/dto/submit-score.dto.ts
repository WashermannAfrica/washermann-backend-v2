import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';

export class SubmitScoreDto {
  @ApiProperty({ example: 'sud-tap' })
  @IsString()
  @Matches(/^[a-z0-9-]{2,60}$/, { message: 'game must be a slug' })
  game: string;

  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(0)
  @Max(1000000)
  score: number;
}
