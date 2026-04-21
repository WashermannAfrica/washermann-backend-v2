import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validates the X-WM-Topup-Code header on every top-up initiation.
 *
 * How the code is generated (client app):
 *   topupKey      = HMAC-SHA256(TOPUP_SIGNING_SECRET, userId)   ← returned at login
 *   timeWindow    = Math.floor(Date.now() / (windowSeconds * 1000))
 *   code          = HMAC-SHA256(TOPUP_CLIENT_APP_SECRET, `${userId}:${topupKey}:${timeWindow}`)
 *
 * The server:
 *   1. Re-derives topupKey from TOPUP_SIGNING_SECRET + userId
 *   2. Checks the code against windows: current-1, current, current+1
 *   3. Uses timingSafeEqual to prevent timing attacks
 *
 * Two secrets are required: possession of the client app binary (TOPUP_CLIENT_APP_SECRET)
 * AND a valid user session (needed to obtain topupKey). Even if the API is discovered,
 * a forged request cannot produce a valid code without both secrets.
 */
@Injectable()
export class TopupGuardService {
  private readonly logger = new Logger(TopupGuardService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Throws UnauthorizedException if the code is invalid or missing.
   */
  validateTopupCode(userId: string, code: string | undefined): void {
    if (!code) {
      throw new UnauthorizedException('Missing X-WM-Topup-Code header');
    }

    const signingSecret  = this.configService.get<string>('topup.signingSecret')  || '';
    const clientSecret   = this.configService.get<string>('topup.clientAppSecret') || '';
    const windowSeconds  = this.configService.get<number>('topup.windowSeconds')  ?? 30;

    if (!signingSecret || !clientSecret) {
      // In development without env vars, skip validation but warn loudly
      this.logger.warn(
        'TOPUP_SIGNING_SECRET or TOPUP_CLIENT_APP_SECRET not set — skipping code validation (INSECURE)',
      );
      return;
    }

    // Re-derive the per-user topupKey (deterministic — never stored)
    const topupKey = createHmac('sha256', signingSecret).update(userId).digest('hex');

    // Current time window (changes every windowSeconds)
    const currentWindow = Math.floor(Date.now() / (windowSeconds * 1000));

    // Accept current window and ±1 to tolerate clock drift between client and server
    const validWindows = [currentWindow - 1, currentWindow, currentWindow + 1];

    const codeBuffer = Buffer.from(code, 'hex');

    for (const window of validWindows) {
      const expected = createHmac('sha256', clientSecret)
        .update(`${userId}:${topupKey}:${window}`)
        .digest('hex');

      const expectedBuffer = Buffer.from(expected, 'hex');

      // Buffers must be same length for timingSafeEqual
      if (
        codeBuffer.length === expectedBuffer.length &&
        timingSafeEqual(codeBuffer, expectedBuffer)
      ) {
        return; // Valid
      }
    }

    this.logger.warn(`Invalid topup code for user ${userId}`);
    throw new UnauthorizedException('Invalid or expired X-WM-Topup-Code');
  }
}
