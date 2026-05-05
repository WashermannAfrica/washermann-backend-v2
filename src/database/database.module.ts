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
import { CompanyWallet } from './entities/company-wallet.entity';
import { CompanyLedgerEntry } from './entities/company-ledger-entry.entity';
import { Vault } from './entities/vault.entity';
import { GiftCard } from './entities/gift-card.entity';
import { GiftCardRedemption } from './entities/gift-card-redemption.entity';
// ─── Phase 6 entities ─────────────────────────────────────────────────────────
import { Area } from './entities/area.entity';
import { Vendor } from './entities/vendor.entity';
import { VendorDocument } from './entities/vendor-document.entity';
import { VendorPricing } from './entities/vendor-pricing.entity';
import { VendorEarningsWallet } from './entities/vendor-earnings-wallet.entity';
import { VendorLedgerEntry } from './entities/vendor-ledger-entry.entity';
import { Rep } from './entities/rep.entity';
import { RepPseudoWallet } from './entities/rep-pseudo-wallet.entity';
import { RepPseudoLedgerEntry } from './entities/rep-pseudo-ledger-entry.entity';
import { PlatformPriceList } from './entities/platform-price-list.entity';
import { PlatformConfig } from './entities/platform-config.entity';
import { RepBonusTier } from './entities/rep-bonus-tier.entity';
import { PayoutRequest } from './entities/payout-request.entity';
import { RatingEvent } from './entities/rating-event.entity';
import { Order } from './entities/order.entity';
import { OrderEscrow } from './entities/order-escrow.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { AssignmentBroadcast } from './entities/assignment-broadcast.entity';
import { InAppNotification } from './entities/in-app-notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';

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
            CompanyWallet, CompanyLedgerEntry,
            Vault, GiftCard, GiftCardRedemption,
            // Phase 6
            Area,
            Vendor, VendorDocument, VendorPricing, VendorEarningsWallet, VendorLedgerEntry,
            Rep, RepPseudoWallet, RepPseudoLedgerEntry,
            PlatformPriceList, PlatformConfig, RepBonusTier,
            PayoutRequest, RatingEvent,
            Order, OrderEscrow, OrderStatusHistory, AssignmentBroadcast,
            // Notifications
            InAppNotification, NotificationTemplate,
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
