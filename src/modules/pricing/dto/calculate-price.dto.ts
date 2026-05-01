import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecialItemInputDto {
  @ApiProperty({ example: 'suit' })
  @IsString()
  type: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CalculatePriceDto {
  @ApiProperty({ enum: ['wash_fold', 'wash_iron'] })
  @IsEnum(['wash_fold', 'wash_iron'])
  serviceType: 'wash_fold' | 'wash_iron';

  @ApiProperty({ enum: ['small', 'medium', 'large', 'xl'] })
  @IsEnum(['small', 'medium', 'large', 'xl'])
  bagSize: 'small' | 'medium' | 'large' | 'xl';

  @ApiPropertyOptional({ type: [SpecialItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SpecialItemInputDto)
  specialItems?: SpecialItemInputDto[];

  @ApiPropertyOptional({ description: 'Number of garments to iron (0 if wash_fold)', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ironingCount?: number;

  @ApiProperty({ description: 'UUID of the pickup area (determines transport fee)' })
  @IsUUID()
  areaId: string;
}
