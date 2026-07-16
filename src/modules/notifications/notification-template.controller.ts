import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
  ApiBody,
} from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsObject, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import {
  NotificationTemplate,
  NotificationChannel,
  EmailStyle,
} from '../../database/entities/notification-template.entity';
import { TemplateService } from './template/template.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class UpdateTemplateDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  subject?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  body?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  htmlBody?: string;

  @ApiProperty({ required: false, description: 'Email styling JSON (for email channel only)' })
  @IsOptional() @IsObject()
  emailStyle?: Partial<EmailStyle>;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  variables?: string[];
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Admin — Notification Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/notification-templates')
export class NotificationTemplateController {
  constructor(
    @InjectRepository(NotificationTemplate)
    private repo: Repository<NotificationTemplate>,
    private templateService: TemplateService,
  ) {}

  // GET /admin/notification-templates
  @Get()
  @ApiOperation({ summary: 'List all notification templates' })
  @ApiQuery({ name: 'channel', required: false, enum: ['email', 'sms', 'push', 'in_app', 'whatsapp'] })
  @ApiQuery({ name: 'key',     required: false, type: String })
  async findAll(
    @Query('channel') channel?: NotificationChannel,
    @Query('key')     key?: string,
  ) {
    const qb = this.repo.createQueryBuilder('t').orderBy('t.key').addOrderBy('t.channel');
    if (channel) qb.andWhere('t.channel = :channel', { channel });
    if (key)     qb.andWhere('t.key = :key', { key });
    return qb.getMany();
  }

  // POST /admin/notification-templates/sync-defaults
  @Post('sync-defaults')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-apply all in-code default content/branding to stored templates (rebrand sync)' })
  async syncDefaults(@Request() req) {
    return this.templateService.resyncDefaults(req.user.sub);
  }

  // GET /admin/notification-templates/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get a single notification template' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.repo.findOneOrFail({ where: { id } });
  }

  // PATCH /admin/notification-templates/:id
  @Patch(':id')
  @ApiOperation({ summary: 'Update a notification template' })
  @ApiBody({ type: UpdateTemplateDto })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @Request() req,
  ) {
    const tpl = await this.repo.findOneOrFail({ where: { id } });

    if (dto.name      !== undefined) tpl.name      = dto.name;
    if (dto.subject   !== undefined) tpl.subject   = dto.subject ?? null;
    if (dto.body      !== undefined) tpl.body       = dto.body;
    if (dto.htmlBody  !== undefined) tpl.htmlBody   = dto.htmlBody ?? null;
    if (dto.isActive  !== undefined) tpl.isActive   = dto.isActive;
    if (dto.variables !== undefined) tpl.variables  = dto.variables;
    if (dto.emailStyle !== undefined) {
      tpl.emailStyle = dto.emailStyle
        ? { ...(tpl.emailStyle ?? {}), ...dto.emailStyle } as EmailStyle
        : null;
    }

    tpl.updatedBy = req.user.sub;
    return this.repo.save(tpl);
  }

  // POST /admin/notification-templates/:id/reset
  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset template to default content (re-seed from code)' })
  async reset(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    const tpl = await this.repo.findOneOrFail({ where: { id } });

    // Find matching default
    const { DEFAULT_TEMPLATES } = await import('./template/default-templates');
    const def = DEFAULT_TEMPLATES.find((d) => d.key === tpl.key && d.channel === tpl.channel);
    if (!def) return { message: 'No default found for this template' };

    tpl.name      = def.name;
    tpl.subject   = def.subject ?? null;
    tpl.body      = def.body;
    tpl.htmlBody  = def.htmlBody ?? null;
    tpl.variables = def.variables;
    tpl.emailStyle = null;
    tpl.isActive  = true;
    tpl.updatedBy = req.user.sub;

    return this.repo.save(tpl);
  }

  // POST /admin/notification-templates/:id/preview
  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview rendered template with sample data' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        emailStyle: { type: 'object', description: 'Optional style overrides for the preview' },
      },
    },
  })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('emailStyle') emailStyle?: Partial<EmailStyle>,
  ) {
    const tpl = await this.repo.findOneOrFail({ where: { id } });
    return this.templateService.preview(tpl.key, tpl.channel, emailStyle);
  }
}
