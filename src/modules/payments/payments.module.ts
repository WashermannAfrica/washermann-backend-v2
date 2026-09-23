import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PaystackTransaction } from '../../database/entities/paystack-transaction.entity';
import { ConversionRateService } from './conversion-rate.service';
import { ConversionRateController } from './conversion-rate.controller';
import { PaystackService } from './paystack.service';
import { TopupGuardService } from './topup-guard.service';
import { WebhooksController } from './webhooks.controller';
import { PaymentsController } from './payments.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { VaultsModule } from '../vaults/vaults.module';
import { CompaniesModule } from '../companies/companies.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversionRate, PaystackTransaction]),
    forwardRef(() => WalletsModule),
    forwardRef(() => VaultsModule),
    forwardRef(() => CompaniesModule),
    forwardRef(() => OrdersModule),
  ],
  controllers: [
    ConversionRateController,
    WebhooksController,
    PaymentsController,
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
