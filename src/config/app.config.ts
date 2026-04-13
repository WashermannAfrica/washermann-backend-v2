import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'Washermann API',
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  washPointConversionRate: parseInt(
    process.env.WASH_POINT_CONVERSION_RATE || '1',
    10,
  ), // ₦1 = 1 Wash Point
  orderAutoConfirmHours: parseInt(
    process.env.ORDER_AUTO_CONFIRM_HOURS || '24',
    10,
  ),
  vendorResponseTimeoutMinutes: parseInt(
    process.env.VENDOR_RESPONSE_TIMEOUT_MINUTES || '30',
    10,
  ),
  inactivityThresholdDays: parseInt(
    process.env.INACTIVITY_THRESHOLD_DAYS || '90',
    10,
  ),
  walletConversionSecret: process.env.WALLET_CONVERSION_SECRET || '',
  adminSetupSecret: process.env.ADMIN_SETUP_SECRET || '',
}));
