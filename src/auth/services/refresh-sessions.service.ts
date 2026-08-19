import { createHash } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

interface RefreshSessionReplacement {
  token: string;
  staffId: string;
  editionId: string | null;
  expiresAt: Date;
}

@Injectable()
export class RefreshSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: RefreshSessionReplacement): Promise<void> {
    await this.prisma.refreshSession.create({
      data: {
        tokenHash: this.hashToken(session.token),
        staffId: session.staffId,
        editionId: session.editionId,
        expiresAt: session.expiresAt,
      },
    });
  }

  async rotate(currentToken: string, replacement: RefreshSessionReplacement): Promise<void> {
    const currentTokenHash = this.hashToken(currentToken);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await this.lockStaffSessions(transaction, replacement.staffId);

      const currentSession = await transaction.refreshSession.findUnique({
        where: { tokenHash: currentTokenHash },
        select: {
          id: true,
          staffId: true,
          expiresAt: true,
          revokedAt: true,
        },
      });

      if (
        !currentSession ||
        currentSession.staffId !== replacement.staffId ||
        currentSession.revokedAt !== null ||
        currentSession.expiresAt <= now
      ) {
        throw this.invalidRefreshToken();
      }

      const revoked = await transaction.refreshSession.updateMany({
        where: {
          id: currentSession.id,
          tokenHash: currentTokenHash,
          staffId: replacement.staffId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });

      if (revoked.count !== 1) {
        throw this.invalidRefreshToken();
      }

      await transaction.refreshSession.create({
        data: {
          tokenHash: this.hashToken(replacement.token),
          staffId: replacement.staffId,
          editionId: replacement.editionId,
          expiresAt: replacement.expiresAt,
          rotatedFromId: currentSession.id,
        },
      });
    });
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return;

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.hashToken(token) },
      select: { staffId: true },
    });
    if (!session) return;

    await this.prisma.$transaction(async (transaction) => {
      await this.lockStaffSessions(transaction, session.staffId);
      await transaction.refreshSession.updateMany({
        where: {
          staffId: session.staffId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    });
  }

  /**
   * Revoga todas as sessões da conta, sem depender de qual token o chamador tem
   * em mãos. É o que a troca de senha precisa: derrubar também as sessões
   * abertas por quem sabia a senha anterior.
   */
  async revokeAllForStaff(staffId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.lockStaffSessions(transaction, staffId);
      await transaction.refreshSession.updateMany({
        where: { staffId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async lockStaffSessions(
    transaction: Prisma.TransactionClient,
    staffId: string,
  ): Promise<void> {
    const lockKey = `refresh-sessions:${staffId}`;
    await transaction.$queryRaw<Array<{ acquired: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text AS "acquired"
    `;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException('Token de atualização inválido ou expirado.');
  }
}
