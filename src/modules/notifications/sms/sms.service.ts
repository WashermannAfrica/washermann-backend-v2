import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SendSmsOptions {
  to: string;   // phone number in international format e.g. +2348012345678
  message: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly baseUrl = 'https://api.ng.termii.com/api';

  constructor(private configService: ConfigService) {}

  async send(options: SendSmsOptions): Promise<boolean> {
    const apiKey = this.configService.get<string>('notifications.termiiApiKey');
    const senderId = this.configService.get<string>('notifications.termiiSenderId');

    if (!apiKey) {
      this.logger.warn('Termii API key not configured — SMS skipped');
      return false;
    }

    try {
      // Normalise phone — Termii expects number without leading +
      const to = options.to.replace(/^\+/, '');

      const response = await axios.post(
        `${this.baseUrl}/sms/send`,
        {
          api_key: apiKey,
          to,
          from: senderId,
          sms: options.message,
          type: 'plain',
          channel: 'generic',
        },
        { timeout: 10000 },
      );

      if (response.data?.code === 'ok') {
        this.logger.log(`SMS sent to ${options.to}`);
        return true;
      }

      this.logger.warn(
        `SMS failed to ${options.to}: ${JSON.stringify(response.data)}`,
      );
      return false;
    } catch (err) {
      this.logger.error(`SMS service error: ${err.message}`);
      return false;
    }
  }
}
