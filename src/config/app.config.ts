import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  name: process.env.APP_NAME || 'Washermann API',
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  // Browser frontends allowed by CORS. FRONTEND_URL may be a comma-separated
  // list; in development the local Washermann web apps are always allowed
  // (admin 3001, company 3002, landing 3003, sales-rep portal 3005).
  corsOrigins: (process.env.FRONTEND_URL || 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .concat(
      process.env.NODE_ENV === 'production'
        ? []
        : [
            'http://localhost:3001',
            'http://localhost:3002',
            'http://localhost:3003',
            'http://localhost:3005',
            'http://localhost:3006',
            'http://localhost:3007',
          ],
    )
    .filter((o, i, a) => a.indexOf(o) === i),
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
  appUrl: process.env.APP_URL || null, // e.g. https://dev-api.washermann.com
  deepLinkBase: process.env.DEEP_LINK_BASE || 'https://app.washermann.com',
  salesRepPortalUrl: process.env.SALES_REP_PORTAL_URL || 'http://localhost:3005',
  adminPortalUrl: process.env.ADMIN_PORTAL_URL || 'http://localhost:3001',
  companyPortalUrl: process.env.COMPANY_PORTAL_URL || 'http://localhost:3002',
  landingUrl: process.env.LANDING_URL || 'http://localhost:3003',
  landingRevalidateSecret: process.env.LANDING_REVALIDATE_SECRET || '',
}));
