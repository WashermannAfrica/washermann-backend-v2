import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ActivateCompanyDto {
  /**
   * The one-time token from the activation link in the invite email.
   * The owner email is read from this token — it is NOT accepted in the request body
   * to prevent an attacker from redirecting activation to a different account.
   */
  @ApiProperty({ example: 'uuid-from-invite-link' })
  @IsNotEmpty()
  @IsString()
  inviteToken: string;

  /** The contact person's name at the company (not the company name). */
  @ApiProperty({ example: 'Jane Smith' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_])/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, { message: 'Invalid phone number format' })
  phone: string;

  @ApiProperty({ example: 'Technology' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  industry: string;

  @ApiProperty({ example: '12 Business Way, Victoria Island, Lagos' })
  @IsNotEmpty()
  @IsString()
  address: string;

  @ApiProperty({ example: 250 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  numberOfWorkers: number;

  @ApiProperty({ example: 'https://acme.com', required: false })
  @IsOptional()
  @IsUrl({}, { message: 'Website must be a valid URL' })
  @MaxLength(255)
  website?: string;

  @ApiProperty({ example: 'We provide top-quality laundry logistics', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
