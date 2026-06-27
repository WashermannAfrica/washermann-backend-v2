import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { OrderEscrow } from '../../database/entities/order-escrow.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { RatingEvent } from '../../database/entities/rating-event.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PricingModule } from '../pricing/pricing.module';
import { VendorsModule } from '../vendors/vendors.module';
import { RepsModule } from '../reps/reps.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order, OrderEscrow, OrderStatusHistory, RatingEvent,
      Rep, Vendor, Wallet, LedgerEntry, ConversionRate,
    ]),
    PricingModule,
    VendorsModule,
    RepsModule,
    PlatformConfigModule,
    UsersModule,
    ReferralsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
