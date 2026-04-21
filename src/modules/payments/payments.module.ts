import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PaystackTransaction } from '../../database/entities/paystack-transaction.entity';
import { ConversionRateService } from './conversion-rate.service';
import { ConversionRateController } from './conversion-rate.controller';
import { PaystackService } from './paystack.service';
import { TopupGuardService } from './topup-guard.service';
import { WebhooksController } from './webhooks.controller';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversionRate, PaystackTransaction]),
    forwardRef(() => WalletsModule),  // circular: PaymentsModule ↔ WalletsModule
  ],
  controllers: [
    ConversionRateController,
    WebhooksController,
  ],
  providers: [
    ConversionRateService,
    PaystackService,
    TopupGuardService,
  ],
  exports: [
    ConversionRateService,
    PaystackService,
    TopupGuardService,
  ],
})
export class PaymentsModule {}
