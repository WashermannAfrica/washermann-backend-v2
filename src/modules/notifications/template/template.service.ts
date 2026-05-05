import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Handlebars from 'handlebars';
import {
  NotificationTemplate,
  NotificationChannel,
  EmailStyle,
} from '../../../database/entities/notification-template.entity';
import { DEFAULT_TEMPLATES, buildEmailHtml } from './default-templates';

export interface RenderedTemplate {
  subject: string | null;
  body:     string;
  htmlBody: string | null;
}

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectRepository(NotificationTemplate)
    private repo: Repository<NotificationTemplate>,
  ) {}

  // ─── Seed default templates on startup ───────────────────────────────────────

  async onModuleInit() {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    let seeded = 0;
    for (const tpl of DEFAULT_TEMPLATES) {
      const exists = await this.repo.findOne({
        where: { key: tpl.key, channel: tpl.channel },
      });
      if (!exists) {
        await this.repo.save(
          this.repo.create({
            key:       tpl.key,
            channel:   tpl.channel,
            name:      tpl.name,
            subject:   tpl.subject ?? null,
            body:      tpl.body,
            htmlBody:  tpl.htmlBody ?? null,
            variables: tpl.variables,
            isActive:  true,
            updatedBy: null,
          }),
        );
        seeded++;
      }
    }
    if (seeded > 0) {
      this.logger.log(`Seeded ${seeded} default notification template(s)`);
    }
  }

  // ─── Render a template ───────────────────────────────────────────────────────

  /**
   * Renders a notification template for a given (key, channel) pair.
   * Looks up the DB first; falls back to the in-code DEFAULT_TEMPLATES.
   * Returns null if no template exists at all.
   */
  async render(
    key:       string,
    channel:   NotificationChannel,
    variables: Record<string, string | number>,
    style?:    Partial<EmailStyle>,
  ): Promise<RenderedTemplate | null> {
    // 1. Add handy computed variables
    const ctx = {
      year: new Date().getFullYear().toString(),
      ...variables,
    };

    // 2. Try DB (active rows first)
    const dbTpl = await this.repo.findOne({ where: { key, channel, isActive: true } });

    if (dbTpl) {
      return this.compile(dbTpl, ctx, style);
    }

    // 3. Fall back to in-code defaults
    const fallback = DEFAULT_TEMPLATES.find((t) => t.key === key && t.channel === channel);
    if (!fallback) return null;

    return {
      subject: fallback.subject ? this.hbs(fallback.subject, ctx) : null,
      body:    this.hbs(fallback.body, ctx),
      htmlBody: fallback.htmlBody ? this.hbs(fallback.htmlBody, ctx) : null,
    };
  }

  // ─── Preview helper (admin panel) ────────────────────────────────────────────

  async preview(
    key:     string,
    channel: NotificationChannel,
    style?:  Partial<EmailStyle>,
  ): Promise<RenderedTemplate | null> {
    // Build sample variables from the template's declared variable list
    const tpl = await this.repo.findOne({ where: { key, channel } });
    if (!tpl) return null;

    const sampleVars: Record<string, string> = {};
    for (const v of tpl.variables) {
      sampleVars[v] = `{{${v}}}`;   // echo variable names as placeholders
    }
    sampleVars['year'] = new Date().getFullYear().toString();

    return this.compile(tpl, sampleVars, style);
  }

  // ─── Compile a DB-backed template ────────────────────────────────────────────

  private compile(
    tpl:   NotificationTemplate,
    ctx:   Record<string, string | number>,
    style?: Partial<EmailStyle>,
  ): RenderedTemplate {
    const subject = tpl.subject ? this.hbs(tpl.subject, ctx) : null;
    const body    = this.hbs(tpl.body, ctx);

    let htmlBody: string | null = null;
    if (tpl.channel === 'email') {
      if (tpl.htmlBody) {
        // Full custom HTML stored in DB — render variables
        htmlBody = this.hbs(tpl.htmlBody, ctx);
      } else {
        // Wrap plain body in the default email layout
        const mergedStyle = { ...(tpl.emailStyle ?? {}), ...(style ?? {}) } as EmailStyle;
        htmlBody = this.hbs(buildEmailHtml(this.hbs(body, ctx), mergedStyle), ctx);
      }
    }

    return { subject, body, htmlBody };
  }

  // ─── Handlebars compile + render ────────────────────────────────────────────

  private hbs(template: string, ctx: Record<string, string | number>): string {
    try {
      return Handlebars.compile(template, { noEscape: true })(ctx);
    } catch {
      // If template is malformed just return the raw string
      return template;
    }
  }
}
