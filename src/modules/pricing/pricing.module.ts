import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { PricingPackage } from '../../database/entities/pricing-package.entity';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { CatalogueCategory } from '../../database/entities/catalogue-category.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { PlatformPriceList } from '../../database/entities/platform-price-list.entity';
import { Bag } from '../../database/entities/bag.entity';
import { Bundle } from '../../database/entities/bundle.entity';
import { BundleLine } from '../../database/entities/bundle-line.entity';
import { PricingController } from './pricing.controller';
import { ItemPricingController } from './item-pricing.controller';
import { OrderQuoteController } from './order-quote.controller';
import { PricingService } from './pricing.service';
import { PricingIntelligenceService } from './pricing-intelligence.service';
import { PricingPackagesService } from './pricing-packages.service';
import { ItemPricingService } from './item-pricing.service';
import { OrderQuoteService } from './order-quote.service';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { AreasModule } from '../areas/areas.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversionRate, VendorPricing, PricingPackage,
      User, Address, Order, CompanyEmployee,
      CatalogueItem, CatalogueCategory, Vendor, PlatformPriceList, Bag, Bundle, BundleLine,
    ]),
    PlatformConfigModule,
    AreasModule,
  ],
  controllers: [PricingController, ItemPricingController, OrderQuoteController],
  providers: [PricingService, PricingIntelligenceService, PricingPackagesService, ItemPricingService, OrderQuoteService],
  exports: [PricingService, PricingIntelligenceService, PricingPackagesService, ItemPricingService, OrderQuoteService],
})
export class PricingModule {}
