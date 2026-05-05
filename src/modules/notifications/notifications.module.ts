import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email/email.service';
import { SmsService } from './sms/sms.service';
import { PushService } from './push/push.service';
import { WhatsappService } from './whatsapp/whatsapp.service';
import { InAppService } from './in-app/in-app.service';
import { InAppController } from './in-app/in-app.controller';
import { TemplateService } from './template/template.service';
import { NotificationsService } from './notifications.service';
import { NotificationTemplateController } from './notification-template.controller';
import { InAppNotification } from '../../database/entities/in-app-notification.entity';
import { NotificationTemplate } from '../../database/entities/notification-template.entity';
import { User } from '../../database/entities/user.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      InAppNotification,
      NotificationTemplate,
      User,
      Vendor,
      Rep,
    ]),
  ],
  controllers: [
    InAppController,
    NotificationTemplateController,
  ],
  providers: [
    EmailService,
    SmsService,
    PushService,
    WhatsappService,
    InAppService,
    TemplateService,
    NotificationsService,
  ],
  exports: [NotificationsService, InAppService],
})
export class NotificationsModule {}
