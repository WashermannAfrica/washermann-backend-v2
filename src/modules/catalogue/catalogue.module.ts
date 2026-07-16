import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogueCategory } from '../../database/entities/catalogue-category.entity';
import { CatalogueSubCategory } from '../../database/entities/catalogue-subcategory.entity';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { VendorItemSuggestion } from '../../database/entities/vendor-item-suggestion.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { VendorPricing } from '../../database/entities/vendor-pricing.entity';
import { PricingPackage } from '../../database/entities/pricing-package.entity';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CatalogueCategory, CatalogueSubCategory, CatalogueItem, VendorItemSuggestion, Vendor,
      VendorPricing, PricingPackage,
    ]),
  ],
  controllers: [CatalogueController],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
