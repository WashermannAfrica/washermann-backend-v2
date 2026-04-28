import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftCard } from '../../database/entities/gift-card.entity';
import { GiftCardRedemption } from '../../database/entities/gift-card-redemption.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { CompanyLedgerEntry } from '../../database/entities/company-ledger-entry.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { GiftCardsController } from './gift-cards.controller';
import { GiftCardsService } from './gift-cards.service';
import { VaultsModule } from '../vaults/vaults.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GiftCard, GiftCardRedemption, CompanyWallet, CompanyLedgerEntry, CompanyEmployee]),
    forwardRef(() => VaultsModule),
    forwardRef(() => WalletsModule),
  ],
  controllers: [GiftCardsController],
  providers: [GiftCardsService],
  exports: [GiftCardsService],
})
export class GiftCardsModule {}
