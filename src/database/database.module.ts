import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Address } from './entities/address.entity';
import { Company } from './entities/company.entity';
import { Tier } from './entities/tier.entity';
import { CompanyEmployee } from './entities/company-employee.entity';
import { CompanyAdmin } from './entities/company-admin.entity';
import { Team } from './entities/team.entity';
import { TeamMember } from './entities/team-member.entity';
import { ConversionRate } from './entities/conversion-rate.entity';
import { Wallet } from './entities/wallet.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { PaystackTransaction } from './entities/paystack-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('database.url');
        const ssl = config.get<boolean>('database.ssl');
        const sslConfig = ssl ? { rejectUnauthorized: false } : false;

        const base = {
          type: 'postgres' as const,
          entities: [
            User, Address,
            Company, Tier, CompanyEmployee, CompanyAdmin, Team, TeamMember,
            ConversionRate, Wallet, LedgerEntry, PaystackTransaction,
          ],
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
          synchronize: config.get<boolean>('database.synchronize'),
          logging: config.get<boolean>('database.logging'),
          migrationsRun: config.get<boolean>('database.migrationsRun'),
          ssl: sslConfig,
        };

        // ── When DATABASE_URL is set (Railway, Neon, Supabase) ─────────────────
        if (databaseUrl) {
          return { ...base, url: databaseUrl };
        }

        // ── Individual params (local Docker) ───────────────────────────────────
        return {
          ...base,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.name'),
        };
      },
    }),
  ],
})
export class DatabaseModule {}
