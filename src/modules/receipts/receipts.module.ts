import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { OrderReceipt } from '../../database/entities/order-receipt.entity';
import { OrderFundingLink } from '../../database/entities/order-funding-link.entity';
import { CatalogueItem } from '../../database/entities/catalogue-item.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { User } from '../../database/entities/user.entity';
import { Area } from '../../database/entities/area.entity';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReceiptRenderService } from './receipt-render.service';
import { PricingModule } from '../pricing/pricing.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderReceipt, Order, OrderFundingLink, CatalogueItem, Vendor, Rep, User, Area,
    ]),
    PricingModule,
    UploadModule,
  ],
  controllers: [ReceiptsController],
  providers: [ReceiptRenderService, ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
