import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  // Full connection URL — takes precedence when set (Railway, Neon, etc.)
  url: process.env.DATABASE_URL || null,

  // Individual params — used when DATABASE_URL is not set (local Docker)
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  name: process.env.DB_NAME || 'washermann',

  ssl: process.env.DB_SSL === 'true',
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  logging: process.env.DB_LOGGING === 'true',
  migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
}));
