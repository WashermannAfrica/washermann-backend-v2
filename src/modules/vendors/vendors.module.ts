import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorDocument } from '../../database/entities/vendor-document.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { VendorEarningsWallet } from '../../database/entities/vendor-earnings-wallet.entity';
import { VendorLedgerEntry } from '../../database/entities/vendor-ledger-entry.entity';
import { User } from '../../database/entities/user.entity';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Vendor,
      VendorDocument,
      VendorPricing,
      VendorEarningsWallet,
      VendorLedgerEntry,
      User,
    ]),
  ],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
