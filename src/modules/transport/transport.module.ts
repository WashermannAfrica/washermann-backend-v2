import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vendor } from '../../database/entities/vendor.entity';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { DistanceService } from './distance.service';
import { TransportService } from './transport.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vendor]), PlatformConfigModule],
  providers: [DistanceService, TransportService],
  exports: [TransportService, DistanceService],
})
export class TransportModule {}
