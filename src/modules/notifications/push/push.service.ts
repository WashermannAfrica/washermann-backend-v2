import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface SendPushOptions {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private initialized = false;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const projectId   = this.configService.get<string>('notifications.firebaseProjectId');
    const clientEmail = this.configService.get<string>('notifications.firebaseClientEmail');
    const privateKey  = this.configService.get<string>('notifications.firebasePrivateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase credentials not configured — push notifications disabled');
      return;
    }

    // Only initialise once even if module is re-instantiated.
    // A malformed key must not crash the whole app — disable push and warn.
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      }
      this.initialized = true;
      this.logger.log('Firebase Admin initialised — push notifications enabled');
    } catch (err) {
      this.initialized = false;
      this.logger.warn(
        `Firebase Admin failed to initialise — push notifications disabled (${(err as Error).message})`,
      );
    }
  }

  async send(options: SendPushOptions): Promise<boolean> {
    if (!this.initialized) {
      this.logger.debug(`Push skipped (Firebase not configured): ${options.title}`);
      return false;
    }
    if (!options.token) return false;

    try {
      await admin.messaging().send({
        token:        options.token,
        notification: { title: options.title, body: options.body },
        data:         options.data ?? {},
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'washermann_default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });
      this.logger.log(`Push sent: "${options.title}" → token ...${options.token.slice(-8)}`);
      return true;
    } catch (err: any) {
      // Stale tokens are common — log as warn, not error
      if (err?.errorInfo?.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`Stale FCM token — push skipped: ...${options.token.slice(-8)}`);
      } else {
        this.logger.error(`Push failed: ${err?.message ?? err}`);
      }
      return false;
    }
  }

  async sendMulti(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<void> {
    if (!this.initialized || tokens.length === 0) return;

    // FCM sendEachForMulticast supports up to 500 tokens per call
    const chunks = [];
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500));
    }

    for (const chunk of chunks) {
      try {
        const res = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data: data ?? {},
          android:  { priority: 'high', notification: { sound: 'default', channelId: 'washermann_default' } },
          apns:     { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        this.logger.log(`Push multicast: ${res.successCount}/${chunk.length} delivered — "${title}"`);
      } catch (err: any) {
        this.logger.error(`Push multicast failed: ${err?.message ?? err}`);
      }
    }
  }
}
