import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { DeviceToken } from '../../database/entities/device-token.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Address, Order, Wallet, CompanyEmployee, DeviceToken, Dispute]), CompaniesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
