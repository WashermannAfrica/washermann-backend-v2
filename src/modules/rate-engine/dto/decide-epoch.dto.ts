import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideEpochDto {
  @ApiPropertyOptional({ description: 'Reason / note for the decision (audited)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
