import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional } from 'class-validator';

export class ReassignTierDto {
  @ApiProperty({
    example: 'uuid-of-tier',
    nullable: true,
    description: 'Pass null to remove tier assignment',
  })
  @IsOptional()
  @IsUUID()
  tierId: string | null;
}
