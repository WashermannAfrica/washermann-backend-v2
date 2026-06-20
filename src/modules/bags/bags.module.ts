import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bag } from '../../database/entities/bag.entity';
import { BagsController } from './bags.controller';
import { BagsService } from './bags.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [TypeOrmModule.forFeature([Bag]), PricingModule],
  controllers: [BagsController],
  providers: [BagsService],
  exports: [BagsService],
})
export class BagsModule {}
