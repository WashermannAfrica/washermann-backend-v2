import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutRequest } from '../../database/entities/payout-request.entity';
import { Rep } from '../../database/entities/rep.entity';
import { RepPseudoWallet } from '../../database/entities/rep-pseudo-wallet.entity';
import { RepBonusTier } from '../../database/entities/rep-bonus-tier.entity';
import { RatingEvent } from '../../database/entities/rating-event.entity';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { VendorsModule } from '../vendors/vendors.module';
import { RepsModule } from '../reps/reps.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayoutRequest, Rep, RepPseudoWallet, RepBonusTier, RatingEvent]),
    VendorsModule,
    RepsModule,
    PlatformConfigModule,
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
