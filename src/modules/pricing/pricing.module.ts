import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { AreasModule } from '../areas/areas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversionRate]),
    PlatformConfigModule,
    AreasModule,
  ],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
