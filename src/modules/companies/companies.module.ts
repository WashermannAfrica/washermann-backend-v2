import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../database/entities/company.entity';
import { Tier } from '../../database/entities/tier.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { CompanyAdmin } from '../../database/entities/company-admin.entity';
import { User } from '../../database/entities/user.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { CompanyLedgerEntry } from '../../database/entities/company-ledger-entry.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyWalletService } from './company-wallet.service';
import { PaymentsModule } from '../payments/payments.module';
import { GiftCardsModule } from '../gift-cards/gift-cards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Tier,
      CompanyEmployee,
      CompanyAdmin,
      User,
      CompanyWallet,
      CompanyLedgerEntry,
      LedgerEntry,
    ]),
    forwardRef(() => PaymentsModule),
    forwardRef(() => GiftCardsModule),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, CompanyWalletService],
  exports: [CompaniesService, CompanyWalletService],
})
export class CompaniesModule {}
