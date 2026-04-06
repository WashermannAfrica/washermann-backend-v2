import { registerAs } from '@nestjs/config';

export default registerAs('seed', () => ({
  adminEmail: process.env.SEED_ADMIN_EMAIL || '',
  adminPassword: process.env.SEED_ADMIN_PASSWORD || '',
  adminName: process.env.SEED_ADMIN_NAME || 'Super Admin',
  adminPhone: process.env.SEED_ADMIN_PHONE || '',
}));
