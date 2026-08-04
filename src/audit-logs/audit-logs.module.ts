import { Global, Module } from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditLogsModule {}
