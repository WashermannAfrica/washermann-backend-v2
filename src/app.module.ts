import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

// Config
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  redisConfig,
  notificationsConfig,
  seedConfig,
  paystackConfig,
  topupConfig,
} from './config';

// Database
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seeds/seed.module';

// Common
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Modules
import { RedisModule } from './modules/redis/redis.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { TeamsModule } from './modules/teams/teams.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { VaultsModule } from './modules/vaults/vaults.module';
import { GiftCardsModule } from './modules/gift-cards/gift-cards.module';
import { StaffModule } from './modules/staff/staff.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // ─── Config ───────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, notificationsConfig, seedConfig, paystackConfig, topupConfig],
      envFilePath: '.env',
    }),

    // ─── Database ─────────────────────────────────────────────────────────────
    DatabaseModule,

    // ─── Seeds (runs onApplicationBootstrap in dev/staging) ───────────────────
    SeedModule,

    // ─── Redis (Global) ───────────────────────────────────────────────────────
    RedisModule,

    // ─── Notifications (Global) ───────────────────────────────────────────────
    NotificationsModule,

    // ─── Feature Modules ──────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    CompaniesModule,
    TeamsModule,
    WalletsModule,
    PaymentsModule,
    VaultsModule,
    GiftCardsModule,
    StaffModule,
    AdminModule,
  ],

  providers: [
    // Global exception handler — all unhandled errors return standard envelope
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    // Global response wrapper — all successful responses return standard envelope
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    // Global JWT guard — all routes require auth unless decorated with @Public()
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global roles guard — enforces @Roles() decorator
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
