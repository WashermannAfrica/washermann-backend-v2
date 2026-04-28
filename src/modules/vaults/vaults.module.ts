import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vault } from '../../database/entities/vault.entity';
import { ConversionRate } from '../../database/entities/conversion-rate.entity';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vault, ConversionRate])],
  controllers: [VaultsController],
  providers: [VaultsService],
  exports: [VaultsService],
})
export class VaultsModule {}
