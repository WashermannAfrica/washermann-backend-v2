import { DataSource } from 'typeorm';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as dotenv from 'dotenv';

// Load .env for CLI usage (outside the NestJS context). This data source powers
// the TypeORM CLI (`migration:generate`, `migration:run`, `migration:revert`,
// `migration:show`) and MUST mirror the runtime connection built in
// database.module.ts — same entities, same DATABASE_URL / DB_* resolution, same
// SSL handling — or generated migrations will drift from the live schema.
dotenv.config();

const ssl =
  process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;

const base: PostgresConnectionOptions = {
  type: 'postgres',
  // Glob every entity so the CLI diffs the FULL schema, not a hand-picked subset.
  // Loads compiled *.entity.js (dist) or *.entity.ts (ts-node) depending on how
  // the CLI is invoked.
  entities: [__dirname + '/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  ssl,
};

// DATABASE_URL wins (Railway / Neon / Supabase); otherwise fall back to the
// individual DB_* params used by local Docker.
export const AppDataSource = new DataSource(
  process.env.DATABASE_URL
    ? { ...base, url: process.env.DATABASE_URL }
    : {
        ...base,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_NAME || 'washermann',
      },
);
