import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateBlogPostDto {
  @ApiProperty({ example: 'How WashPoints work' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Plain-text summary for cards + meta description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ description: 'Cover image URL (from POST /upload/blog-image)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  coverImageUrl?: string;

  @ApiPropertyOptional({ description: 'HTML body from the editor — sanitized server-side' })
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @ApiPropertyOptional({ type: [String], description: 'Flat tags, e.g. ["laundry-tips"]' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoTitle?: string;

  @ApiPropertyOptional({ maxLength: 320 })
  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string;
}

export class UpdateBlogPostDto extends PartialType(CreateBlogPostDto) {
  @ApiPropertyOptional({ description: 'Editable only while the post has never been published' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(220)
  slug?: string;
}

export class RequestChangesDto {
  @ApiProperty({ description: 'What the author should fix', maxLength: 1000 })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note: string;
}
