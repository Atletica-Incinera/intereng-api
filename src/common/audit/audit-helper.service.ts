import { Injectable } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Prisma } from '@prisma/client';

export interface AuditRecordParams {
  staffId: string;
  editionId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
}

@Injectable()
export class AuditHelperService {
  async recordAudit(
    auditService: AuditService,
    params: AuditRecordParams,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await auditService.record(
      {
        staffId: params.staffId,
        editionId: params.editionId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before ?? null,
        after: params.after ?? null,
      },
      tx,
    );
  }
}
