import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { Vendor } from '../../database/entities/vendor.entity';
import { Rep } from '../../database/entities/rep.entity';
import { VendorDocument } from '../../database/entities/vendor-document.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VendorsModule } from '../vendors/vendors.module';
import { RepsModule } from '../reps/reps.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Vendor, Rep, VendorDocument]),
    VendorsModule,
    RepsModule,
  ],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
