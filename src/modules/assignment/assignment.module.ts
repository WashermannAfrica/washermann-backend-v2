import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Order } from '../../database/entities/order.entity';
import { AssignmentBroadcast } from '../../database/entities/assignment-broadcast.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { AssignmentController } from './assignment.controller';
import { AssignmentService } from './assignment.service';
import { AreasModule } from '../areas/areas.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rep, Vendor, Order, AssignmentBroadcast, OrderStatusHistory]),
    AreasModule,
    PlatformConfigModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [AssignmentController],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
