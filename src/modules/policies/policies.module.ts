import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Policy } from '../../database/entities/policy.entity';
import { PolicyVersion } from '../../database/entities/policy-version.entity';
import { PolicyAcceptance } from '../../database/entities/policy-acceptance.entity';
import { PoliciesController } from './policies.controller';
import { AdminPoliciesController } from './admin-policies.controller';
import { ConsentController } from './consent.controller';
import { PoliciesService } from './policies.service';
import { ConsentService } from './consent.service';

@Module({
  imports: [TypeOrmModule.forFeature([Policy, PolicyVersion, PolicyAcceptance])],
  controllers: [PoliciesController, AdminPoliciesController, ConsentController],
  providers: [PoliciesService, ConsentService],
  exports: [PoliciesService, ConsentService],
})
export class PoliciesModule {}
