import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Acme Corp' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  /**
   * The company's primary email. An activation invite will be sent here.
   * This email becomes the login credential for the company owner account.
   */
  @ApiProperty({ example: 'owner@acme.com' })
  @IsNotEmpty()
  @IsEmail({}, { message: 'Please provide a valid company owner email' })
  ownerEmail: string;
}
