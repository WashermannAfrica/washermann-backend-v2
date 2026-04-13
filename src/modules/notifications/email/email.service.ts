import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;
  private fromName: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('notifications.resendApiKey');
    this.fromEmail = this.configService.get<string>('notifications.fromEmail');
    this.fromName = this.configService.get<string>('notifications.fromName');
    this.resend = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<boolean> {
    try {
      const from = `${this.fromName} <${this.fromEmail}>`;
      const { error } = await this.resend.emails.send({
        from,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        this.logger.error(`Email send failed to ${options.to}: ${error.message}`);
        return false;
      }

      this.logger.log(`Email sent to ${options.to} — "${options.subject}"`);
      return true;
    } catch (err) {
      this.logger.error(`Email service error: ${err.message}`);
      return false;
    }
  }
}
