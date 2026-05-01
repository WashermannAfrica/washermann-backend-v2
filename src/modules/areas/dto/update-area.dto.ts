import { PartialType } from '@nestjs/swagger';
import { CreateAreaDto } from './create-area.dto';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAreaDto extends PartialType(CreateAreaDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
