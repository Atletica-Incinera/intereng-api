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
 *
 * Logs are stored in the database to maintain a history of modifications,
 * capturing the changes, the actor, and the target entity.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a new audit log entry in the database.
   *
   * This method saves details about changes made to an entity, including the
   * identity of the staff member who made the change, the edition ID of the
   * competition (if applicable), the action type, entity details, and the
   * state before and after the modification.
   *
   * It can optionally run within an existing Prisma transaction context to guarantee
   * transactional consistency (all-or-nothing rollback).
   *
   * @param data - The audit log entry details (staff ID, action, before/after data, etc.)
   * @param tx - Optional Prisma transaction client. If provided, the audit log will be created
   *             within the transaction context.
   * @returns A promise that resolves to the created AuditLog entity.
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
}
