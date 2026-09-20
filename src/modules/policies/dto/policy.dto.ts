import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min,
} from 'class-validator';

export class CreatePolicyDto {
  @ApiProperty({ example: 'privacy-policy' })
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'key must be a lowercase kebab-case slug' })
  @MaxLength(80)
  key: string;

  @ApiProperty({ example: 'Privacy Policy' })
  @IsString()
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: ['customer', 'vendor'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audiences?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audiences?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateVersionDto {
  @ApiProperty({ description: 'Canonical Markdown source' })
  @IsString()
  contentMarkdown: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  effectiveDate: string;

  @ApiPropertyOptional({ description: 'What changed vs the previous version' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresReconsent?: boolean;

  @ApiPropertyOptional({ enum: ['markdown', 'docx'], default: 'markdown' })
  @IsOptional()
  @IsIn(['markdown', 'docx'])
  sourceFormat?: string;
}

export class UploadVersionDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class AcceptPoliciesDto {
  @ApiPropertyOptional({
    description: 'Policy keys to accept. Omit to accept everything currently pending for the user.',
    example: ['privacy-policy', 'terms-of-service'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keys?: string[];

  @ApiPropertyOptional({ enum: ['signup', 'onboarding', 'reconsent', 'explicit'], default: 'explicit' })
  @IsOptional()
  @IsIn(['signup', 'onboarding', 'reconsent', 'explicit'])
  method?: 'signup' | 'onboarding' | 'reconsent' | 'explicit';
}

export class UpdateVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentMarkdown?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresReconsent?: boolean;
}
