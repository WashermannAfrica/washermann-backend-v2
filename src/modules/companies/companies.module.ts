import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../database/entities/company.entity';
import { Tier } from '../../database/entities/tier.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { CompanyAdmin } from '../../database/entities/company-admin.entity';
import { User } from '../../database/entities/user.entity';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Tier,
      CompanyEmployee,
      CompanyAdmin,
      User,
    ]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
