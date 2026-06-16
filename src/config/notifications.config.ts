import { registerAs } from '@nestjs/config';

export default registerAs('notifications', () => ({
  // ─── Resend (email) ───────────────────────────────────────────────────────────
  resendApiKey:   process.env.RESEND_API_KEY    || '',
  fromEmail:      process.env.RESEND_FROM_EMAIL || 'no-reply@washermann.com',
  fromName:       process.env.RESEND_FROM_NAME  || 'Washermann',
  // Absolute, publicly-hosted PNG of the white wordmark shown in the email header.
  // Email clients can't render local files or SVG — host on R2/CDN and set this.
  // When unset, emails fall back to the styled text wordmark (no broken image).
  emailLogoUrl:   process.env.EMAIL_LOGO_URL || '',

  // ─── Termii (SMS) ─────────────────────────────────────────────────────────────
  termiiApiKey:   process.env.TERMII_API_KEY    || '',
  termiiSenderId: process.env.TERMII_SENDER_ID  || 'Washermann',

  // ─── Firebase (FCM push) ──────────────────────────────────────────────────────
  firebaseProjectId:   process.env.FIREBASE_PROJECT_ID   || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  // Private key is stored as single-line with literal \n — restore real newlines
  firebasePrivateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),

  // ─── Twilio (WhatsApp) ────────────────────────────────────────────────────────
  twilioAccountSid:   process.env.TWILIO_ACCOUNT_SID   || '',
  twilioAuthToken:    process.env.TWILIO_AUTH_TOKEN     || '',
  // Twilio WhatsApp number in E.164 format prefixed with "whatsapp:"
  // e.g. "whatsapp:+14155238886" (sandbox) or your approved number
  twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',

  // ─── Deep link base ───────────────────────────────────────────────────────────
  deepLinkBase: process.env.DEEP_LINK_BASE || 'washermann://app',

  // ─── Admin notifications ──────────────────────────────────────────────────────
  adminEmail: process.env.ADMIN_NOTIFICATION_EMAIL || '',
}));
