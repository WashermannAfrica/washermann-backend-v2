import { registerAs } from '@nestjs/config';

export default registerAs('paystack', () => ({
  secretKey:     process.env.PAYSTACK_SECRET_KEY     || '',
  publicKey:     process.env.PAYSTACK_PUBLIC_KEY     || '',
  webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
  baseUrl:       'https://api.paystack.co',
  /** Minimum top-up amount in kobo (default ₦100 = 10,000 kobo) */
  minTopupKobo:  parseInt(process.env.MIN_TOPUP_KOBO  || '10000',   10),
  /** Maximum top-up amount in kobo (default ₦500,000 = 50,000,000 kobo) */
  maxTopupKobo:  parseInt(process.env.MAX_TOPUP_KOBO  || '50000000', 10),
}));
