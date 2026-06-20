import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bundle } from '../../database/entities/bundle.entity';
import { BundleLine } from '../../database/entities/bundle-line.entity';
import { BundlesController } from './bundles.controller';
import { BundlesService } from './bundles.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bundle, BundleLine]), PricingModule],
  controllers: [BundlesController],
  providers: [BundlesService],
  exports: [BundlesService],
})
export class BundlesModule {}
