import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email or phone number associated with the account',
  })
  @IsNotEmpty()
  @IsString()
  identifier: string;
}
