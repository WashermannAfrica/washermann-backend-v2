import { registerAs } from '@nestjs/config';

export default registerAs('notifications', () => ({
  // Resend (email)
  resendApiKey: process.env.RESEND_API_KEY || '',
  fromEmail: process.env.RESEND_FROM_EMAIL || 'no-reply@washermann.com',
  fromName: process.env.RESEND_FROM_NAME || 'Washermann',

  // Termii (SMS)
  termiiApiKey: process.env.TERMII_API_KEY || '',
  termiiSenderId: process.env.TERMII_SENDER_ID || 'Washermann',

  // Deep link base for invite links (mobile app scheme or web URL)
  deepLinkBase: process.env.DEEP_LINK_BASE || 'washermann://app',
}));
