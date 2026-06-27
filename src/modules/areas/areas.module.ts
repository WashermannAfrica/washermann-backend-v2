import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Area } from '../../database/entities/area.entity';
import { AreaLocation } from '../../database/entities/area-location.entity';
import { Rep } from '../../database/entities/rep.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Order } from '../../database/entities/order.entity';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Area, AreaLocation, Rep, Vendor, Order])],
  controllers: [AreasController],
  providers: [AreasService],
  exports: [AreasService],
})
export class AreasModule {}
