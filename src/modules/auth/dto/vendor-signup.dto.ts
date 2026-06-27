import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Public vendor self-registration.
 *
 * Collects only the essentials to create the account; business name, phone,
 * NIN/CAC, documents, bank details and address are captured afterwards in the
 * KYC flow (PATCH /vendors/me/profile, /upload/vendor/document). The account is
 * created in PENDING_REVIEW and cannot go available until an admin verifies it.
 */
export class VendorSignupDto {
  @ApiProperty({ example: 'Adaeze Okafor' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'vendor@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({ example: 'WM-AB12CD', required: false, description: 'Referral code (optional)' })
  @IsOptional()
  @IsString()
  referralCode?: string;
}
