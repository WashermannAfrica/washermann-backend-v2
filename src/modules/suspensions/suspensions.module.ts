import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SuspensionNotice } from '../../database/entities/suspension-notice.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { SuspensionsService } from './suspensions.service';
import { SuspensionsController } from './suspensions.controller';
import { VendorsModule } from '../vendors/vendors.module';
import { RepsModule } from '../reps/reps.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SuspensionNotice, Vendor, Rep]),
    VendorsModule,
    RepsModule,
    PlatformConfigModule,
  ],
  controllers: [SuspensionsController],
  providers: [SuspensionsService],
  exports: [SuspensionsService],
})
export class SuspensionsModule {}
