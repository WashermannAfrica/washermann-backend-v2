import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorDocument } from '../../database/entities/vendor-document.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { VendorEarningsWallet } from '../../database/entities/vendor-earnings-wallet.entity';
import { VendorLedgerEntry } from '../../database/entities/vendor-ledger-entry.entity';
import { EarningsDeduction } from '../../database/entities/earnings-deduction.entity';
import { User } from '../../database/entities/user.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { VendorsController } from './vendors.controller';
import { DeductionsController } from './deductions.controller';
import { VendorsService } from './vendors.service';
import { ReferralsModule } from '../referrals/referrals.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { AreasModule } from '../areas/areas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vendor,
      VendorDocument,
      VendorPricing,
      VendorEarningsWallet,
      VendorLedgerEntry,
      EarningsDeduction,
      User,
      ConversionRate,
    ]),
    ReferralsModule,
    PlatformConfigModule,
    AreasModule,
  ],
  controllers: [VendorsController, DeductionsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
