import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email or phone number',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsNotEmpty()
  @IsString()
  password: string;
}
