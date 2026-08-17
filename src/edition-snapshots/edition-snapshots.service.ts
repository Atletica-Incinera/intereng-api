import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EditionStaffRoleType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ActiveEditionResolver, ResolvedEdition } from './active-edition.resolver';
import { FrontendSnapshotDto, SnapshotResultDto } from './dto/frontend-snapshot.dto';
import type { RequestedEditionRole } from './edition-request-headers';
import { SnapshotMapper, SnapshotScope } from './snapshot.mapper';

const PUBLIC_CACHE_VERSION = 'v2';
const PUBLIC_CACHE_TTL_SECONDS = 60 * 60;
const SNAPSHOT_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  maxWait: 5_000,
  timeout: 30_000,
} as const;

@Injectable()
export class EditionSnapshotsService {
  private readonly logger = new Logger(EditionSnapshotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly activeEditionResolver: ActiveEditionResolver,
    private readonly snapshotMapper: SnapshotMapper,
  ) {}

  async getPrivateSnapshot(
    editionId: string,
    user: AuthenticatedUser,
    requestedRole?: RequestedEditionRole,
    requestedEditionDisciplineId?: string,
    operatorDeviceId?: string,
  ): Promise<SnapshotResultDto> {
    return this.prisma.$transaction(async (transaction) => {
      const edition = await this.resolveEditionInTransaction(transaction, editionId);
      const scope = await this.resolvePrivateScopeInTransaction(
        transaction,
        edition,
        user,
        requestedRole,
        requestedEditionDisciplineId,
      );
      const snapshot = await this.buildPrivateSnapshotInTransaction(
        transaction,
        edition,
        scope,
        operatorDeviceId,
      );

      return {
        snapshot,
        revision: edition.revision,
        etag: this.etag(
          edition,
          'private',
          `${this.scopeKey(scope, user)}:operator-device:${operatorDeviceId ?? 'none'}`,
        ),
      };
    }, SNAPSHOT_TRANSACTION_OPTIONS);
  }

  resolveEditionInTransaction(
    transaction: Prisma.TransactionClient,
    editionId: string,
  ): Promise<ResolvedEdition> {
    return this.activeEditionResolver.resolve(transaction, editionId);
  }

  resolvePrivateScopeInTransaction(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    user: AuthenticatedUser,
    requestedRole?: RequestedEditionRole,
    requestedEditionDisciplineId?: string,
  ): Promise<SnapshotScope> {
    return this.resolveScope(
      transaction,
      edition,
      user,
      requestedRole,
      requestedEditionDisciplineId,
    );
  }

  buildPrivateSnapshotInTransaction(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    scope: SnapshotScope,
    operatorDeviceId?: string,
  ): Promise<FrontendSnapshotDto> {
    return this.snapshotMapper.build(transaction, edition, {
      public: false,
      scope,
      operatorDeviceId,
    });
  }

  async getPublicSnapshot(editionId: string): Promise<SnapshotResultDto> {
    const resolvedForCache = await this.prisma.$transaction(
      (transaction) => this.activeEditionResolver.resolve(transaction, editionId),
      SNAPSHOT_TRANSACTION_OPTIONS,
    );
    const cacheKey = this.publicCacheKey(resolvedForCache);
    const cached = await this.readPublicCache(cacheKey);

    if (cached) {
      return {
        snapshot: cached,
        revision: resolvedForCache.revision,
        etag: this.etag(resolvedForCache, 'public', 'public'),
      };
    }

    const generated = await this.prisma.$transaction(async (transaction) => {
      const edition = await this.activeEditionResolver.resolve(transaction, editionId);
      const snapshot = await this.snapshotMapper.build(transaction, edition, {
        public: true,
        scope: { kind: 'full' },
      });
      return { edition, snapshot };
    }, SNAPSHOT_TRANSACTION_OPTIONS);

    await this.writePublicCache(this.publicCacheKey(generated.edition), generated.snapshot);

    return {
      snapshot: generated.snapshot,
      revision: generated.edition.revision,
      etag: this.etag(generated.edition, 'public', 'public'),
    };
  }

  private async resolveScope(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    user: AuthenticatedUser,
    requestedRole?: RequestedEditionRole,
    requestedEditionDisciplineId?: string,
  ): Promise<SnapshotScope> {
    if (user.isSuperAdmin) return { kind: 'full' };

    if (!edition.isActive) {
      throw new ForbiddenException('Seu perfil não possui acesso a esta edição.');
    }

    const roles = await transaction.editionStaffRole.findMany({
      where: {
        editionId: edition.id,
        staffId: user.id,
        revokedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        role: true,
        editionDisciplineId: true,
      },
    });

    const hasEditionAdminRole = roles.some(
      (role) => role.role === EditionStaffRoleType.EDITION_ADMIN,
    );

    const disciplineManagerRoleIds = [
      ...new Set(
        roles
          .filter(
            (role) =>
              role.role === EditionStaffRoleType.DISCIPLINE_MANAGER &&
              role.editionDisciplineId !== null,
          )
          .map((role) => role.editionDisciplineId as string),
      ),
    ];

    if (requestedRole === 'EDITION_ADMIN') {
      if (requestedEditionDisciplineId) {
        throw new BadRequestException(
          'O header X-Edition-Discipline-Id não deve ser enviado para o papel EDITION_ADMIN.',
        );
      }
      if (!hasEditionAdminRole) {
        throw new ForbiddenException(
          'Seu perfil não possui o papel de administrador nesta edição.',
        );
      }
      return { kind: 'full' };
    }

    if (requestedRole === 'DISCIPLINE_MANAGER') {
      if (!requestedEditionDisciplineId) {
        throw new BadRequestException(
          'O header X-Edition-Discipline-Id é obrigatório para o papel DISCIPLINE_MANAGER.',
        );
      }
      if (!disciplineManagerRoleIds.includes(requestedEditionDisciplineId)) {
        throw new ForbiddenException(
          'Seu perfil não possui acesso à modalidade selecionada nesta edição.',
        );
      }
      return {
        kind: 'discipline',
        editionDisciplineId: requestedEditionDisciplineId,
      };
    }

    if (requestedEditionDisciplineId) {
      throw new BadRequestException(
        'O header X-Edition-Role é obrigatório ao selecionar uma modalidade.',
      );
    }

    if (hasEditionAdminRole) return { kind: 'full' };

    if (disciplineManagerRoleIds.length > 1) {
      throw new BadRequestException(
        'Os headers X-Edition-Role e X-Edition-Discipline-Id são obrigatórios quando o gestor possui mais de uma modalidade.',
      );
    }

    const disciplineManagerRole = roles.find(
      (role) =>
        role.role === EditionStaffRoleType.DISCIPLINE_MANAGER &&
        role.editionDisciplineId === disciplineManagerRoleIds[0],
    );
    if (disciplineManagerRole?.editionDisciplineId) {
      return {
        kind: 'discipline',
        editionDisciplineId: disciplineManagerRole.editionDisciplineId,
      };
    }

    throw new ForbiddenException('Seu perfil não possui acesso a esta edição.');
  }

  private async readPublicCache(cacheKey: string): Promise<FrontendSnapshotDto | null> {
    try {
      const cached = await this.redisService.getClient().get(cacheKey);
      if (!cached) return null;
      const parsed: unknown = JSON.parse(cached);
      return this.isFrontendSnapshot(parsed) ? parsed : null;
    } catch (error: unknown) {
      this.logger.warn(`Falha ao ler o cache público de snapshots: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async writePublicCache(cacheKey: string, snapshot: FrontendSnapshotDto): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(cacheKey, JSON.stringify(snapshot), 'EX', PUBLIC_CACHE_TTL_SECONDS);
    } catch (error: unknown) {
      this.logger.warn(`Falha ao gravar o cache público de snapshots: ${this.errorMessage(error)}`);
    }
  }

  private publicCacheKey(edition: ResolvedEdition): string {
    return `edition-snapshot:public:${PUBLIC_CACHE_VERSION}:${edition.id}:${edition.revision}`;
  }

  private etag(edition: ResolvedEdition, variant: 'private' | 'public', scope: string): string {
    const digest = createHash('sha256')
      .update(`${edition.id}:${edition.revision}:${variant}:${scope}`)
      .digest('hex');
    return `"${digest}"`;
  }

  private scopeKey(scope: SnapshotScope, user: AuthenticatedUser): string {
    if (scope.kind === 'discipline') return `discipline:${scope.editionDisciplineId}`;
    return user.isSuperAdmin ? 'super-admin' : 'edition-admin';
  }

  private isFrontendSnapshot(value: unknown): value is FrontendSnapshotDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const snapshot = value as Record<string, unknown>;
    return (
      Array.isArray(snapshot.competitions) &&
      Array.isArray(snapshot.editions) &&
      this.isRecord(snapshot.teams) &&
      this.isRecord(snapshot.athletes) &&
      this.isRecord(snapshot.disciplines) &&
      this.isRecord(snapshot.tournaments) &&
      this.isRecord(snapshot.matches) &&
      this.isRecord(snapshot.overallRanking) &&
      this.isRecord(snapshot.staff) &&
      Array.isArray(snapshot.audit) &&
      !Object.prototype.hasOwnProperty.call(snapshot, 'preferences')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
