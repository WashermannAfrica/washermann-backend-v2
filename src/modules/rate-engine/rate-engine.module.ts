import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateConfig } from '../../database/entities/rate-config.entity';
import { RateEpoch } from '../../database/entities/rate-epoch.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { RateEngineController } from './rate-engine.controller';
import { RateEngineService } from './rate-engine.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RateConfig, RateEpoch, ConversionRate, PlatformConfig]),
    NotificationsModule,
  ],
  controllers: [RateEngineController],
  providers: [RateEngineService],
  exports: [RateEngineService],
})
export class RateEngineModule {}
