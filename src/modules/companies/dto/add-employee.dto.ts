import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class AddEmployeeDto {
  /**
   * Provide either email or phone to look up / invite the user.
   */
  @ApiProperty({ example: 'jane@acme.com', required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({ example: '+2348012345678', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
  phone?: string;

  @ApiProperty({ example: 'uuid-of-tier', required: false })
  @IsOptional()
  @IsUUID()
  tierId?: string;
}
