import { Global, Module } from '@nestjs/common';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { NotificationsService } from './notifications.service';

@Global() // Makes NotificationsService available everywhere without re-importing
@Module({
  providers: [EmailService, SmsService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
