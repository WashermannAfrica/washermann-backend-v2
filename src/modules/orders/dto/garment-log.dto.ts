import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogGarmentCountDto {
  @ApiProperty({
    description: 'Map of garmentType → count, e.g. { "shirt": 15, "trouser": 8 }',
    example: { shirt: 15, trouser: 8, dress: 4 },
  })
  @IsObject()
  garmentLog: Record<string, number>;

  @ApiPropertyOptional({ description: 'Optional rep note about the pickup' })
  @IsOptional()
  @IsString()
  note?: string;
}
