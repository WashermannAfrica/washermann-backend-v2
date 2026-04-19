import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateTierDto {
  @ApiProperty({ example: 'Senior Staff' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 500, description: 'Points allocated per billing cycle' })
  @IsInt()
  @Min(0)
  monthlyPoints: number;

  @ApiProperty({ example: 4, description: 'Max orders per billing cycle' })
  @IsInt()
  @Min(0)
  monthlyOrderLimit: number;

  @ApiProperty({ example: 10, description: 'Max items per order' })
  @IsInt()
  @Min(1)
  itemLimit: number;
}
