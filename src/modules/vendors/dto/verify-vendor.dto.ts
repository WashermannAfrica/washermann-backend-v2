import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorVerificationStatus } from '../../../common/enums/vendor-verification-status.enum';

export class VerifyVendorDto {
  @ApiProperty({ enum: [VendorVerificationStatus.VERIFIED, VendorVerificationStatus.REJECTED] })
  @IsEnum([VendorVerificationStatus.VERIFIED, VendorVerificationStatus.REJECTED])
  decision: VendorVerificationStatus.VERIFIED | VendorVerificationStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Required when decision = rejected' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}
