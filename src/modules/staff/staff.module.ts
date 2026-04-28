import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [StaffController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
