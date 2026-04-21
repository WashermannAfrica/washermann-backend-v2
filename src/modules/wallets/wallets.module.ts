import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from '../../database/entities/wallet.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { PaystackTransaction } from '../../database/entities/paystack-transaction.entity';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, LedgerEntry, PaystackTransaction]),
    forwardRef(() => PaymentsModule),  // circular: WalletsModule ↔ PaymentsModule
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
