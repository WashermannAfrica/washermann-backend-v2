import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AddAreaLocationDto {
  @ApiProperty({ example: 'Oniru' })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name: string;
}

export class DeactivateAreaDto {
  @ApiPropertyOptional({ example: 'Low demand' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'No active vendors in this area.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
