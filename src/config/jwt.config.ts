import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET || 'wm-access-secret-change-me',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET || 'wm-refresh-secret-change-me',
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  resetPasswordExpiresIn:
    process.env.JWT_RESET_PASSWORD_EXPIRES_IN || '1h',
  inviteExpiresIn: process.env.JWT_INVITE_EXPIRES_IN || '7d',
}));
