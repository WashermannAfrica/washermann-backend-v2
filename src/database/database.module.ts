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
import { AreaLocation } from './entities/area-location.entity';
import { GameScore } from './entities/game-score.entity';
import { CoverageGap } from './entities/coverage-gap.entity';
import { BlogPost } from './entities/blog-post.entity';
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
import { PricingPackage } from './entities/pricing-package.entity';
// ─── Marketing ──────────────────────────────────────────────────────────────────
import { WaitlistSignup } from './entities/waitlist-signup.entity';
import { WashRepApplication } from './entities/wash-rep-application.entity';
// ─── Catalogue ────────────────────────────────────────────────────────────────
import { CatalogueCategory } from './entities/catalogue-category.entity';
import { CatalogueSubCategory } from './entities/catalogue-subcategory.entity';
import { CatalogueItem } from './entities/catalogue-item.entity';
import { VendorItemSuggestion } from './entities/vendor-item-suggestion.entity';
import { Bag } from './entities/bag.entity';
import { Bundle } from './entities/bundle.entity';
import { BundleLine } from './entities/bundle-line.entity';
// ─── Referrals ────────────────────────────────────────────────────────────────
import { ReferralCode } from './entities/referral-code.entity';
import { Referral } from './entities/referral.entity';
import { RewardRule } from './entities/reward-rule.entity';
// ─── Sales rep ────────────────────────────────────────────────────────────────
import { SalesRepApplication } from './entities/sales-rep-application.entity';
import { SalesRep } from './entities/sales-rep.entity';
import { TutorialStep } from './entities/tutorial-step.entity';
import { AssessmentQuestion } from './entities/assessment-question.entity';
import { AssessmentAttempt } from './entities/assessment-attempt.entity';
import { SalesRepPayout } from './entities/sales-rep-payout.entity';
// ─── Rate engine ──────────────────────────────────────────────────────────────
import { RateConfig } from './entities/rate-config.entity';
import { RateEpoch } from './entities/rate-epoch.entity';
import { AuditLog } from './entities/audit-log.entity';
import { DeviceToken } from './entities/device-token.entity';

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
            Area, AreaLocation, CoverageGap,
            BlogPost,
            Vendor, VendorDocument, VendorPricing, VendorEarningsWallet, VendorLedgerEntry,
            Rep, RepPseudoWallet, RepPseudoLedgerEntry,
            PlatformPriceList, PlatformConfig, RepBonusTier,
            PayoutRequest, RatingEvent,
            Order, OrderEscrow, OrderStatusHistory, AssignmentBroadcast,
            // Notifications
            InAppNotification, NotificationTemplate,
            // Packages
            PricingPackage,
            // Marketing
            WaitlistSignup, WashRepApplication,
            // Catalogue
            CatalogueCategory, CatalogueSubCategory, CatalogueItem, VendorItemSuggestion, Bag,
            Bundle, BundleLine,
            // Referrals
            ReferralCode, Referral, RewardRule,
            // Games
            GameScore,
            // Sales rep
            SalesRepApplication, SalesRep, TutorialStep,
            AssessmentQuestion, AssessmentAttempt, SalesRepPayout,
            // Rate engine
            RateConfig, RateEpoch,
            // Audit
            AuditLog,
            // Push
            DeviceToken,
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
