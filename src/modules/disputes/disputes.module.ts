import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from '../../database/entities/dispute.entity';
import { DisputeEvent } from '../../database/entities/dispute-event.entity';
import { Order } from '../../database/entities/order.entity';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Dispute, DisputeEvent, Order]), WalletsModule],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
