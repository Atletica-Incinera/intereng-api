import { createHash } from 'node:crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { EditionStaffRoleType, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { ActiveEditionResolver, ResolvedEdition } from './active-edition.resolver';
import { FrontendSnapshotDto, SnapshotResultDto } from './dto/frontend-snapshot.dto';
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

  async getPrivateSnapshot(editionId: string, user: AuthenticatedUser): Promise<SnapshotResultDto> {
    return this.prisma.$transaction(async (transaction) => {
      const edition = await this.activeEditionResolver.resolve(transaction, editionId);
      const scope = await this.resolveScope(transaction, edition, user);
      const snapshot = await this.snapshotMapper.build(transaction, edition, {
        public: false,
        scope,
      });

      return {
        snapshot,
        revision: edition.revision,
        etag: this.etag(edition, 'private', this.scopeKey(scope, user)),
      };
    }, SNAPSHOT_TRANSACTION_OPTIONS);
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

    if (roles.some((role) => role.role === EditionStaffRoleType.EDITION_ADMIN)) {
      return { kind: 'full' };
    }

    const disciplineManagerRole = roles.find(
      (role) =>
        role.role === EditionStaffRoleType.DISCIPLINE_MANAGER && role.editionDisciplineId !== null,
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
