import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralCode } from '../../database/entities/referral-code.entity';
import { Referral } from '../../database/entities/referral.entity';
import { RewardRule } from '../../database/entities/reward-rule.entity';
import { User } from '../../database/entities/user.entity';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReferralCode, Referral, RewardRule, User])],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
