import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';
import { User } from '../../database/entities/user.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Global so any service can inject AuditService to record richer events, and the
 * global AuditInterceptor (registered in AppModule) can resolve it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
