import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { PricingPackage } from '../../database/entities/pricing-package.entity';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingIntelligenceService } from './pricing-intelligence.service';
import { PricingPackagesService } from './pricing-packages.service';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { AreasModule } from '../areas/areas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversionRate, VendorPricing, PricingPackage,
      User, Address, Order, CompanyEmployee,
    ]),
    PlatformConfigModule,
    AreasModule,
  ],
  controllers: [PricingController],
  providers: [PricingService, PricingIntelligenceService, PricingPackagesService],
  exports: [PricingService, PricingIntelligenceService, PricingPackagesService],
})
export class PricingModule {}
