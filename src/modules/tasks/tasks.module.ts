import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { AssignmentBroadcast } from '../../database/entities/assignment-broadcast.entity';
import { TasksService } from './tasks.service';
import { OrdersModule } from '../orders/orders.module';
import { AssignmentModule } from '../assignment/assignment.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, AssignmentBroadcast]),
    OrdersModule,
    AssignmentModule,
    PayoutsModule,
    VendorsModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
