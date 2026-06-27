import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectApplicationDto {
  @ApiPropertyOptional({ example: 'Outside current launch area.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
