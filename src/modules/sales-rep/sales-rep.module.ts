import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesRepApplication } from '../../database/entities/sales-rep-application.entity';
import { SalesRep } from '../../database/entities/sales-rep.entity';
import { TutorialStep } from '../../database/entities/tutorial-step.entity';
import { AssessmentQuestion } from '../../database/entities/assessment-question.entity';
import { AssessmentAttempt } from '../../database/entities/assessment-attempt.entity';
import { SalesRepPayout } from '../../database/entities/sales-rep-payout.entity';
import { Referral } from '../../database/entities/referral.entity';
import { User } from '../../database/entities/user.entity';
import { SalesRepController } from './sales-rep.controller';
import { SalesRepService } from './sales-rep.service';
import { AuthModule } from '../auth/auth.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesRepApplication,
      SalesRep,
      TutorialStep,
      AssessmentQuestion,
      AssessmentAttempt,
      SalesRepPayout,
      Referral,
      User,
    ]),
    AuthModule,
    ReferralsModule,
    NotificationsModule,
  ],
  controllers: [SalesRepController],
  providers: [SalesRepService],
  exports: [SalesRepService],
})
export class SalesRepModule {}
