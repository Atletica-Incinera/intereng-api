import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecordInput {
  staffId?: string | null;
  editionId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
}

/**
 * Service responsible for recording audit logs for administrative operations.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a new audit log entry in the database.
   */
  async record(data: AuditRecordInput, tx?: Prisma.TransactionClient) {
    const client = tx || this.prisma;
    return client.auditLog.create({
      data: {
        staffId: data.staffId || null,
        editionId: data.editionId || null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        beforeData:
          data.before !== undefined && data.before !== null
            ? (data.before as Prisma.InputJsonValue)
            : Prisma.DbNull,
        afterData:
          data.after !== undefined && data.after !== null
            ? (data.after as Prisma.InputJsonValue)
            : Prisma.DbNull,
      },
    });
  }

  async findByEdition(editionId: string) {
    return this.prisma.auditLog.findMany({
      where: { editionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll() {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}