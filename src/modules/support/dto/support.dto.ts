import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendSupportMessageDto {
  @ApiProperty({ example: 'Hi, my order came back with a stain.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional({ type: [String], description: 'Attachment image URLs (upload via POST /upload/dispute-evidence)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  attachments?: string[];
}

export class UpdateConversationDto {
  @ApiPropertyOptional({ enum: ['open', 'pending', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'pending', 'closed'])
  status?: 'open' | 'pending' | 'closed';

  @ApiPropertyOptional({ description: 'Assign this conversation to the calling agent' })
  @IsOptional()
  assignToMe?: boolean;
}
