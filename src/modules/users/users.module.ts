import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { DeviceToken } from '../../database/entities/device-token.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { LedgerEntry } from '../../database/entities/ledger-entry.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { VendorLedgerEntry } from '../../database/entities/vendor-ledger-entry.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Address, Order, Wallet, CompanyEmployee, DeviceToken, Dispute, OrderStatusHistory, LedgerEntry, Vendor, Rep, VendorLedgerEntry]), CompaniesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
