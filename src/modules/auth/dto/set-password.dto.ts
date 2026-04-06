import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ description: 'Invite token received via email or SMS link' })
  @IsNotEmpty()
  @IsString()
  inviteToken: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}
