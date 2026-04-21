import { registerAs } from '@nestjs/config';

export default registerAs('topup', () => ({
  /**
   * Server-side secret used to derive per-user topupKeys.
   * Never sent to the client. TOPUP_SIGNING_SECRET in env.
   */
  signingSecret: process.env.TOPUP_SIGNING_SECRET || '',

  /**
   * Shared secret baked into the mobile app binary.
   * Also held server-side for HMAC validation. TOPUP_CLIENT_APP_SECRET in env.
   */
  clientAppSecret: process.env.TOPUP_CLIENT_APP_SECRET || '',

  /**
   * Size of each TOTP window in seconds (default 30 s).
   * Server accepts current window ± 1 to tolerate clock drift.
   */
  windowSeconds: parseInt(process.env.TOPUP_CODE_WINDOW_SECONDS || '30', 10),

  /**
   * Security question displayed before an admin can change the conversion rate.
   * RATE_CHANGE_SECURITY_QUESTION in env.
   */
  securityQuestion: process.env.RATE_CHANGE_SECURITY_QUESTION || '',

  /**
   * bcrypt hash of the correct answer to the security question.
   * RATE_CHANGE_SECURITY_ANSWER_HASH in env.
   */
  securityAnswerHash: process.env.RATE_CHANGE_SECURITY_ANSWER_HASH || '',

  /**
   * Minutes a new rate must wait before it becomes effective (default 60).
   * Prevents a spiked rate being exploited immediately after a change.
   */
  rateChangeDelayMinutes: parseInt(process.env.RATE_CHANGE_EFFECTIVE_DELAY_MINUTES || '60', 10),
}));
