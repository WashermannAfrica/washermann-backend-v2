import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RedeemGiftCardDto {
  @ApiProperty({ example: 'WM-ABCD1234XY' })
  @IsString()
  @Length(8, 30)
  code: string;
}
