import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { OrderEscrow } from '../../database/entities/order-escrow.entity';
import { OrderFundingLink } from '../../database/entities/order-funding-link.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { RatingEvent } from '../../database/entities/rating-event.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderFundingController } from './order-funding.controller';
import { OrderFundingService } from './order-funding.service';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { VaultsModule } from '../vaults/vaults.module';
import { VendorsModule } from '../vendors/vendors.module';
import { RepsModule } from '../reps/reps.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { UsersModule } from '../users/users.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { AreasModule } from '../areas/areas.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { TransportModule } from '../transport/transport.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { GiftCardsModule } from '../gift-cards/gift-cards.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order, OrderEscrow, OrderFundingLink, OrderStatusHistory, RatingEvent,
      Rep, Vendor, Wallet, LedgerEntry, ConversionRate,
    ]),
    PricingModule,
    VendorsModule,
    RepsModule,
    PlatformConfigModule,
    // forwardRef: the Orders↔Payments module cycle (funding) means these can be
    // mid-evaluation when OrdersModule is first loaded via the Payments path.
    forwardRef(() => UsersModule),
    ReferralsModule,
    AreasModule,
    CatalogueModule,
    TransportModule,
    GiftCardsModule,
    VaultsModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => AssignmentModule),
  ],
  controllers: [OrdersController, OrderFundingController],
  providers: [OrdersService, OrderFundingService],
  exports: [OrdersService, OrderFundingService],
})
export class OrdersModule {}
