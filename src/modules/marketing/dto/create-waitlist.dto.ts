import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWaitlistDto {
  @ApiProperty({ example: 'ada@example.com' })
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty({ example: 'Ada Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: ['individual', 'company'], default: 'individual' })
  @IsOptional()
  @IsIn(['individual', 'company'])
  segment?: 'individual' | 'company';

  @ApiPropertyOptional({ enum: ['hero', 'waitlist', 'final-cta'], default: 'waitlist' })
  @IsOptional()
  @IsIn(['hero', 'waitlist', 'final-cta'])
  source?: 'hero' | 'waitlist' | 'final-cta';

  /** Honeypot — must be empty. Bots tend to fill every field. */
  @ApiPropertyOptional({ description: 'Honeypot (leave empty)' })
  @IsOptional()
  @IsString()
  company_website?: string;
}
