import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Lenient on purpose: the service normalises (strips spaces/dashes) and then
 * validates the digit shape, so a user can type "0801 234 5678".
 */
export class GuestStartDto {
  @ApiProperty({
    example: '+2348012345678',
    description: 'Phone number to send the SMS OTP to',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}
