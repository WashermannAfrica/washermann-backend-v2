import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { LogisticsController } from './logistics.controller';
import { LogisticsService } from './logistics.service';
import { TransportModule } from '../transport/transport.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { PricingModule } from '../pricing/pricing.module';
import { AreasModule } from '../areas/areas.module';
import { OrdersModule } from '../orders/orders.module';
import { RepsModule } from '../reps/reps.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, Vendor]),
    TransportModule,
    PlatformConfigModule,
    PricingModule,
    AreasModule,
    OrdersModule,
    RepsModule,
    WalletsModule,
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
