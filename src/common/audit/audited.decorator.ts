import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';

/**
 * Interface that classes using the `@Audited` decorator must implement
 * to expose their `AuditService` instance.
 *
 * This ensures strict typing and avoids dynamic reflective lookup of the service
 * in the class instance keys, resolving Single Responsibility Principle (SRP) violations.
 */
export interface Auditable {
  readonly auditService: AuditService;
}

/**
 * Audit context parameters supplied to methods decorated with `@Audited`.
 */
export interface AuditContext {
  staffId?: string | null;
  editionId?: string | null;
  tx?: Prisma.TransactionClient;
}

/**
 * Method decorator that intercepts execution to record an audit log entry automatically.
 *
 * It expects the target class to implement the `Auditable` interface, exposing
 * the `auditService` property directly. This avoids dynamic reflection hacks (like
 * searching class values for an instance of `AuditService`) and guarantees type safety.
 *
 * The decorated method must follow the signature:
 * `method(before: any, after: any, ctx?: AuditContext, ...args: any[])`
 *
 * Flow:
 * 1. The original method executes (allowing database updates/transactions to complete).
 * 2. An audit record is created using the class's `auditService` with the provided
 *    before/after states, staff/edition IDs, and transaction client (if present in `ctx`).
 * 3. The original method's result is returned.
 *
 * @param action - The action identifier (e.g. 'UPDATE_STATUS')
 * @param entityType - The database model name (e.g. 'Match')
 */
export function Audited(action: string, entityType: string) {
  return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value as (
      this: Auditable,
      ...args: unknown[]
    ) => Promise<unknown>;

    descriptor.value = async function (this: Auditable, ...args: unknown[]): Promise<unknown> {
      // args signature expected: (before, after, ctx)
      const before = args[0] as Record<string, unknown> | null | undefined;
      const after = args[1] as Record<string, unknown> | null | undefined;
      const ctx = args[2] as AuditContext | undefined;

      const auditService = this.auditService;

      if (!auditService || !(auditService instanceof AuditService)) {
        const className = this && this.constructor ? this.constructor.name : 'unknown class';
        throw new Error(
          `AuditService is not injected or available on the instance of ${className}`,
        );
      }

      // Execute original method first (so logic runs within transaction first)
      const result = await (originalMethod.apply(this, args) as Promise<unknown>);

      const entityId = (after?.id as string) || (before?.id as string) || '';
      const staffId = ctx?.staffId;
      const editionId = ctx?.editionId;
      const tx = ctx?.tx;

      await auditService.record(
        {
          staffId,
          editionId,
          action,
          entityType,
          entityId,
          before: before ?? undefined,
          after: after ?? undefined,
        },
        tx,
      );

      return result;
    };

    return descriptor;
  };
}
