import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface SendWhatsappOptions {
  to: string;   // Phone in E.164 format e.g. +2348012345678
  message: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private client: Twilio | null = null;
  private fromNumber: string = '';

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('notifications.twilioAccountSid');
    const authToken  = this.configService.get<string>('notifications.twilioAuthToken');
    this.fromNumber  = this.configService.get<string>('notifications.twilioWhatsappFrom') || '';

    if (!accountSid || !authToken) {
      this.logger.warn('Twilio credentials not configured — WhatsApp notifications disabled');
      return;
    }

    this.client = new Twilio(accountSid, authToken);
    this.logger.log('Twilio initialised — WhatsApp notifications enabled');
  }

  async send(options: SendWhatsappOptions): Promise<boolean> {
    if (!this.client || !this.fromNumber) {
      this.logger.debug(`WhatsApp skipped (Twilio not configured): to=${options.to}`);
      return false;
    }

    // Normalise the "to" number into Twilio WhatsApp format
    const to = options.to.startsWith('whatsapp:')
      ? options.to
      : `whatsapp:${options.to}`;

    try {
      await this.client.messages.create({
        from: this.fromNumber,
        to,
        body: options.message,
      });
      this.logger.log(`WhatsApp sent to ${options.to}`);
      return true;
    } catch (err: any) {
      this.logger.error(`WhatsApp send failed to ${options.to}: ${err?.message ?? err}`);
      return false;
    }
  }
}
