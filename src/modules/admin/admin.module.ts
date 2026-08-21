import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { Vault } from '../../database/entities/vault.entity';
import { Order } from '../../database/entities/order.entity';
import { Rep } from '../../database/entities/rep.entity';
import { PayoutRequest } from '../../database/entities/payout-request.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Company, Wallet, CompanyWallet, Vault, Order, Rep, PayoutRequest, OrderStatusHistory])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
