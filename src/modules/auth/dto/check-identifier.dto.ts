import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CheckIdentifierDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address or phone number to look up',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;
}
