import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
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
  cloudinaryConfig,
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
import { AreasModule } from './modules/areas/areas.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { RepsModule } from './modules/reps/reps.module';
import { PlatformConfigModule } from './modules/platform-config/platform-config.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UploadModule } from './modules/upload/upload.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { BagsModule } from './modules/bags/bags.module';
import { BundlesModule } from './modules/bundles/bundles.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { SalesRepModule } from './modules/sales-rep/sales-rep.module';
import { RateEngineModule } from './modules/rate-engine/rate-engine.module';
import { GamesModule } from './modules/games/games.module';
import { BlogModule } from './modules/blog/blog.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './modules/audit/audit.interceptor';

@Module({
  imports: [
    // ─── Scheduler ───────────────────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Config ───────────────────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig, notificationsConfig, seedConfig, paystackConfig, topupConfig, cloudinaryConfig],
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
    // ─── Phase 6 ──────────────────────────────────────────────────────────────
    AreasModule,
    VendorsModule,
    RepsModule,
    PlatformConfigModule,
    PricingModule,
    OrdersModule,
    AssignmentModule,
    PayoutsModule,
    TasksModule,
    UploadModule,
    MarketingModule,
    CatalogueModule,
    BagsModule,
    BundlesModule,
    ReferralsModule,
    SalesRepModule,
    RateEngineModule,
    GamesModule,
    BlogModule,
    AuditModule,
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
    // Global audit trail — records every mutating request from any application
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
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
