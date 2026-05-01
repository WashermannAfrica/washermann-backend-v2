import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformConfig } from '../../database/entities/platform-config.entity';
import { PlatformPriceList } from '../../database/entities/platform-price-list.entity';
import { RepBonusTier } from '../../database/entities/rep-bonus-tier.entity';
import { PlatformConfigController } from './platform-config.controller';
import { PlatformConfigService } from './platform-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformConfig, PlatformPriceList, RepBonusTier])],
  controllers: [PlatformConfigController],
  providers: [PlatformConfigService],
  exports: [PlatformConfigService],
})
export class PlatformConfigModule {}
