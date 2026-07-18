import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SuspendVendorDto {
  @ApiPropertyOptional({
    description:
      'Why the account is being deactivated. Included in the email/SMS sent to the vendor, ' +
      'so write it for the vendor to read. Falls back to a generic "contact support" line.',
    example: 'Repeated late deliveries reported by customers.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
