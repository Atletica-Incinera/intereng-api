import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { ResolvedEdition } from '../edition-snapshots/active-edition.resolver';
import { NoActiveEditionException } from '../edition-snapshots/no-active-edition.exception';
import {
  FrontendSnapshotDto,
  SnapshotEnvelopeDto,
} from '../edition-snapshots/dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import type { RequestedEditionRole } from '../edition-snapshots/edition-request-headers';
import { SnapshotScope } from '../edition-snapshots/snapshot.mapper';
import { EditionRevisionEvent, RealtimeService } from '../realtime/realtime.service';
import { actionEmail, actionId, actionObject, actionString } from './action-validation';
import { EditionActionDto } from './dto/edition-action.dto';
import {
  EDITION_ACTION_TYPES,
  EditionActionContext,
  EditionActionExecutionResult,
  EditionActionRegistry,
  EditionActionType,
} from './edition-actions.types';
import { CatalogActionHandler } from './handlers/catalog-action.handler';
import { CategoryActionHandler } from './handlers/category-action.handler';
import { ContextActionHandler } from './handlers/context-action.handler';
import { MatchActionHandler } from './handlers/match-action.handler';
import { RankingActionHandler } from './handlers/ranking-action.handler';

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 60_000,
} as const;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_SERIALIZABLE_RETRIES = 3;
const GLOBAL_ACTIONS = new Set<EditionActionType>([
  'competition/create',
  'competition/rename',
  'competition/activate',
  'edition/create',
  'edition/update',
  'edition/activate',
  // Diferente de staff/upsert (que admin de edição também executa, via
  // authorizeEditionAdminStaff): conceder super admin é irrestrito — global,
  // sem checagem de escopo — então cabe no mesmo gate "só super admin" das
  // ações acima, não numa branch própria.
  'staff/promoteSuperAdmin',
]);
const MANAGER_ACTIONS = new Set<EditionActionType>([
  'match/schedule',
  'match/update',
  'match/start',
  'match/updateClock',
  'match/registerEvent',
  'match/attributeEvent',
  'match/claimOperator',
  'match/releaseOperator',
  'match/undoEvent',
  'match/finish',
  'match/correctResult',
  'category/create',
  'category/update',
  'category/generateMatches',
  'discipline/update',
  // O gestor cadastra e ajusta atletas da PROPRIA modalidade. A restricao de
  // escopo nao cabe em `targetDisciplineId`, que devolve uma modalidade so:
  // um atleta pode ter varias, e o gestor nao pode alcancar as outras. Por
  // isso estas duas tem verificacao propria, em `authorizeManagerAthlete`.
  'athlete/create',
  'athlete/update',
]);
const CREATED_ACTIONS = new Set<EditionActionType>([
  'match/schedule',
  'category/create',
  'team/create',
  'athlete/create',
  'competition/create',
  'edition/create',
]);

interface ActionTransactionOutcome {
  result: EditionActionExecutionResult;
  revisionEvents: EditionRevisionEvent[];
}

@Injectable()
export class EditionActionsService {
  private readonly logger = new Logger(EditionActionsService.name);
  private readonly registry: EditionActionRegistry;

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: EditionSnapshotsService,
    private readonly realtime: RealtimeService,
    matchActions: MatchActionHandler,
    categoryActions: CategoryActionHandler,
    catalogActions: CatalogActionHandler,
    rankingActions: RankingActionHandler,
    contextActions: ContextActionHandler,
  ) {
    this.registry = {
      'match/schedule': (context, payload) => matchActions.schedule(context, payload),
      'match/update': (context, payload, audit) => matchActions.update(context, payload, audit),
      'match/start': (context, payload, audit) => matchActions.start(context, payload, audit),
      'match/updateClock': (context, payload) => matchActions.updateClock(context, payload),
      'match/registerEvent': (context, payload) => matchActions.registerEvent(context, payload),
      'match/attributeEvent': (context, payload) => matchActions.attributeEvent(context, payload),
      'match/claimOperator': (context, payload) => matchActions.claimOperator(context, payload),
      'match/releaseOperator': (context, payload) => matchActions.releaseOperator(context, payload),
      'match/undoEvent': (context, payload, audit) =>
        matchActions.undoEvent(context, payload, audit),
      'match/finish': (context, payload, audit) => matchActions.finish(context, payload, audit),
      'match/correctResult': (context, payload, audit) =>
        matchActions.correctResult(context, payload, audit),
      'category/create': (context, payload) => categoryActions.create(context, payload),
      'category/update': (context, payload) => categoryActions.update(context, payload),
      'category/generateMatches': (context, payload, audit) =>
        categoryActions.generateMatches(context, payload, audit),
      'discipline/update': (context, payload) => catalogActions.disciplineUpdate(context, payload),
      'discipline/delete': (context, payload) => catalogActions.disciplineDelete(context, payload),
      'team/create': (context, payload) => catalogActions.teamCreate(context, payload),
      'team/update': (context, payload) => catalogActions.teamUpdate(context, payload),
      'athlete/create': (context, payload) => catalogActions.athleteCreate(context, payload),
      'athlete/update': (context, payload) => catalogActions.athleteUpdate(context, payload),
      'ranking/addMetric': (context, payload) => rankingActions.addMetric(context, payload),
      'ranking/updateMetric': (context, payload) => rankingActions.updateMetric(context, payload),
      'ranking/removeMetric': (context, payload, audit) =>
        rankingActions.removeMetric(context, payload, audit),
      // Fora de GLOBAL_ACTIONS e de MANAGER_ACTIONS de propósito: cai no mesmo
      // gate das outras ações de métrica, liberada para super admin e admin de
      // edição (escopo full) e recusada ao gestor de modalidade, que não
      // responde pelo ranking geral.
      'ranking/seedDefaultMetrics': (context, payload) =>
        rankingActions.seedDefaultMetrics(context, payload),
      'ranking/addAwards': (context, payload, audit) =>
        rankingActions.addAwards(context, payload, audit),
      'ranking/revokeAward': (context, payload, audit) =>
        rankingActions.revokeAward(context, payload, audit),
      'ranking/close': (context, payload) => rankingActions.close(context, payload),
      'ranking/reopen': (context, payload, audit) => rankingActions.reopen(context, payload, audit),
      'competition/create': (context, payload) =>
        contextActions.competitionCreate(context, payload),
      'competition/rename': (context, payload) =>
        contextActions.competitionRename(context, payload),
      'competition/activate': (context, payload) =>
        contextActions.competitionActivate(context, payload),
      'edition/create': (context, payload) => contextActions.editionCreate(context, payload),
      'edition/update': (context, payload) => contextActions.editionUpdate(context, payload),
      'edition/activate': (context, payload) => contextActions.editionActivate(context, payload),
      'staff/upsert': (context, payload) => contextActions.staffUpsert(context, payload),
      'staff/remove': (context, payload) => contextActions.staffRemove(context, payload),
      'staff/promoteSuperAdmin': (context, payload) =>
        contextActions.promoteSuperAdmin(context, payload),
    };
  }

  /**
   * A edição em que a ação roda — ou a mais recente, quando a ação é global.
   *
   * Toda ação responde com um snapshot de edição, e é esse envelope, não a
   * gravação, que obriga a existir uma edição resolvível. Para `competition/*`,
   * `edition/*` e `staff/promoteSuperAdmin` isso é acoplamento puro: promover um
   * super administrador não toca dado de edição nenhum, e mesmo assim falhava
   * com "não foi possível determinar a competição ativa" sempre que não houvesse
   * competição ativa — exatamente o estado entre duas edições, e o estado em que
   * ter um segundo super admin mais importa.
   *
   * A ressalva que fica: com ZERO edições no banco não há envelope a devolver, e
   * a recusa continua. Sair disso é o `/competitions/bootstrap`, que existe para
   * esse fim.
   */
  private async resolveEditionForAction(
    transaction: Prisma.TransactionClient,
    editionId: string,
    // Ainda cru: o tipo só é validado adiante, em `actionType()`. Aqui basta
    // saber se ele consta do conjunto global.
    actionType: string,
  ) {
    try {
      return await this.snapshots.resolveEditionInTransaction(transaction, editionId);
    } catch (error) {
      const isGlobal = (GLOBAL_ACTIONS as ReadonlySet<string>).has(actionType);
      if (!(error instanceof NoActiveEditionException) || !isGlobal) {
        throw error;
      }
      const fallback = await transaction.competitionEdition.findFirst({
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!fallback) throw error;
      return this.snapshots.resolveEditionInTransaction(transaction, fallback.id);
    }
  }

  getRegisteredActionTypes(): readonly EditionActionType[] {
    return EDITION_ACTION_TYPES;
  }

  async execute(
    editionId: string,
    idempotencyKeyHeader: string | undefined,
    action: EditionActionDto,
    user: AuthenticatedUser,
    requestedRole?: RequestedEditionRole,
    requestedEditionDisciplineId?: string,
    operatorDeviceId?: string,
  ): Promise<EditionActionExecutionResult> {
    const actionType = this.actionType(action.type);
    const idempotencyKey = this.idempotencyKey(idempotencyKeyHeader);
    const requestHash = this.requestHash(
      action,
      requestedRole,
      requestedEditionDisciplineId,
      operatorDeviceId,
    );

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        const outcome: ActionTransactionOutcome = await this.prisma.$transaction(
          async (transaction) => {
            await this.advisoryLock(transaction, `edition-action:request:${editionId}`);
            const routeReceipt = await transaction.editionActionReceipt.findFirst({
              where: {
                idempotencyKey,
                responseData: { path: ['_routeEditionId'], equals: editionId },
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: { editionId: true, requestHash: true, responseData: true },
            });
            if (routeReceipt) {
              if (routeReceipt.requestHash !== requestHash) {
                throw new ConflictException(
                  'A chave de idempotência já foi usada com um payload diferente.',
                );
              }
              await this.advisoryLock(
                transaction,
                `edition-action:edition:${routeReceipt.editionId}`,
              );
              const receiptEdition = await this.snapshots.resolveEditionInTransaction(
                transaction,
                routeReceipt.editionId,
              );
              const receiptScope = await this.snapshots.resolvePrivateScopeInTransaction(
                transaction,
                receiptEdition,
                user,
                requestedRole,
                requestedEditionDisciplineId,
              );
              await this.authorize(
                transaction,
                receiptEdition,
                receiptScope,
                user,
                actionType,
                action.payload,
              );
              return {
                result: {
                  envelope: this.receiptEnvelope(routeReceipt.responseData, user),
                  statusCode: CREATED_ACTIONS.has(actionType) ? 201 : 200,
                },
                revisionEvents: [],
              };
            }

            const edition = await this.resolveEditionForAction(transaction, editionId, action.type);
            await this.advisoryLock(transaction, `edition-action:edition:${edition.id}`);
            const scope = await this.snapshots.resolvePrivateScopeInTransaction(
              transaction,
              edition,
              user,
              requestedRole,
              requestedEditionDisciplineId,
            );
            const actor = await transaction.staff.findUnique({
              where: { id: user.id },
              select: { id: true, name: true },
            });
            if (!actor) throw new NotFoundException('Usuário autenticado não encontrado.');

            const existingReceipt = await transaction.editionActionReceipt.findUnique({
              where: {
                editionId_idempotencyKey: {
                  editionId: edition.id,
                  idempotencyKey,
                },
              },
              select: { requestHash: true, responseData: true },
            });
            await this.authorize(transaction, edition, scope, user, actionType, action.payload);
            if (existingReceipt) {
              if (existingReceipt.requestHash !== requestHash) {
                throw new ConflictException(
                  'A chave de idempotência já foi usada com um payload diferente.',
                );
              }
              const envelope = this.receiptEnvelope(existingReceipt.responseData, user);
              return {
                result: {
                  envelope,
                  statusCode: CREATED_ACTIONS.has(actionType) ? 201 : 200,
                },
                revisionEvents: [],
              };
            }

            const context: EditionActionContext = {
              transaction,
              edition,
              user,
              actorName: actor.name,
              scope,
              ...(operatorDeviceId ? { operatorDeviceId } : {}),
            };
            const mutation = await this.registry[actionType](context, action.payload, action.audit);
            if (
              scope.kind === 'discipline' &&
              mutation.editionDisciplineId !== scope.editionDisciplineId
            ) {
              throw new ForbiddenException(
                'A ação tentou alterar dados fora da modalidade permitida.',
              );
            }

            const responseEditionId = mutation.responseEditionId ?? edition.id;
            await transaction.auditLog.create({
              data: {
                editionId: responseEditionId,
                staffId: user.id,
                action: actionType,
                entityType: mutation.entityType,
                entityId: mutation.entityId,
                ...(action.audit?.before ? { beforeData: action.audit.before } : {}),
                ...(action.audit?.after ? { afterData: action.audit.after } : {}),
                ...(action.audit?.reason?.trim() ? { reason: action.audit.reason.trim() } : {}),
              },
            });

            const affectedEditionIds = [
              ...new Set([...(mutation.affectedEditionIds ?? []), responseEditionId]),
            ].sort();
            const revisionEvents: EditionRevisionEvent[] = [];
            for (const affectedEditionId of affectedEditionIds) {
              const affectedEdition = await transaction.competitionEdition.update({
                where: { id: affectedEditionId },
                data: { revision: { increment: 1 } },
                select: { id: true, revision: true },
              });
              revisionEvents.push({
                editionId: affectedEdition.id,
                revision: affectedEdition.revision,
              });
            }
            const revisedEdition = await this.snapshots.resolveEditionInTransaction(
              transaction,
              responseEditionId,
            );
            const responseScope = await this.snapshots.resolvePrivateScopeInTransaction(
              transaction,
              revisedEdition,
              user,
              requestedRole,
              requestedEditionDisciplineId,
            );
            const snapshot = await this.snapshots.buildPrivateSnapshotInTransaction(
              transaction,
              revisedEdition,
              responseScope,
              operatorDeviceId,
            );
            const envelope: SnapshotEnvelopeDto = {
              data: snapshot,
              meta: { revision: revisedEdition.revision },
            };
            await transaction.editionActionReceipt.create({
              data: {
                editionId: responseEditionId,
                idempotencyKey,
                actionType,
                requestHash,
                resultRevision: revisedEdition.revision,
                responseData: {
                  data: envelope.data,
                  meta: envelope.meta,
                  _actorId: user.id,
                  _routeEditionId: editionId,
                } as unknown as Prisma.InputJsonValue,
              },
            });
            return {
              result: {
                envelope,
                statusCode: CREATED_ACTIONS.has(actionType) ? 201 : 200,
              },
              revisionEvents,
            };
          },
          TRANSACTION_OPTIONS,
        );
        this.publishCommittedRevisions(outcome.revisionEvents);
        return outcome.result;
      } catch (error: unknown) {
        if (this.isSerializableConflict(error) && attempt < MAX_SERIALIZABLE_RETRIES) continue;
        throw this.mapPrismaError(error);
      }
    }
    throw new InternalServerErrorException('Não foi possível concluir a ação.');
  }

  private publishCommittedRevisions(events: readonly EditionRevisionEvent[]): void {
    for (const event of events) {
      void this.realtime.publishEditionRevision(event).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'erro desconhecido';
        this.logger.warn(
          `A mutação foi confirmada, mas a revisão ${event.revision} da edição ${event.editionId} não foi publicada: ${message}`,
        );
      });
    }
  }

  private async authorize(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    scope: SnapshotScope,
    user: AuthenticatedUser,
    actionType: EditionActionType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (user.isSuperAdmin) return;
    if (GLOBAL_ACTIONS.has(actionType)) {
      throw new ForbiddenException('Somente o super administrador pode executar esta ação global.');
    }
    if (actionType === 'staff/upsert') {
      await this.authorizeEditionAdminStaff(transaction, edition.id, scope, payload);
      return;
    }
    if (scope.kind === 'full') return;
    if (!MANAGER_ACTIONS.has(actionType)) {
      throw new ForbiddenException('Gestores de modalidade não podem executar esta ação.');
    }
    if (actionType === 'athlete/create' || actionType === 'athlete/update') {
      await this.authorizeManagerAthlete(transaction, edition.id, scope, actionType, payload);
      return;
    }
    const targetDisciplineId = await this.targetDisciplineId(
      transaction,
      edition.id,
      actionType,
      payload,
    );
    if (targetDisciplineId !== scope.editionDisciplineId) {
      throw new ForbiddenException('A ação está fora da modalidade atribuída ao gestor.');
    }
    if (actionType === 'discipline/update') {
      const patch = actionObject(payload.patch, 'A alteração da modalidade');
      const forbiddenFields = ['created', 'mode', 'name', 'tournaments'].filter(
        (field) => patch[field] !== undefined,
      );
      if (patch.enabled === false || forbiddenFields.length) {
        throw new ForbiddenException(
          'O gestor pode alterar apenas as regras da modalidade atribuída.',
        );
      }
    }
  }

  /**
   * Atleta do gestor: so a modalidade dele, e so atleta que ja e dele.
   *
   * Sem a segunda metade, um gestor de Futsal poderia editar um atleta de
   * Basquete e, no mesmo movimento, arrasta-lo para o Futsal — o payload de
   * `athlete/update` carrega as modalidades. A checagem de escopo tem que
   * olhar o estado ATUAL do atleta, nao so o que o payload pede.
   */
  private async authorizeManagerAthlete(
    transaction: Prisma.TransactionClient,
    editionId: string,
    scope: { kind: 'discipline'; editionDisciplineId: string },
    actionType: EditionActionType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const propria = await transaction.editionDiscipline.findFirst({
      where: { id: scope.editionDisciplineId, editionId },
      select: { discipline: { select: { name: true } } },
    });
    if (!propria) {
      throw new ForbiddenException('A modalidade atribuída ao gestor não pertence a esta edição.');
    }
    const nomeProprio = propria.discipline.name;

    const corpo =
      actionType === 'athlete/create'
        ? actionObject(payload.athlete, 'O atleta')
        : actionObject(payload.patch, 'A alteração do atleta');
    const modalidades = corpo.modalities;

    if (actionType === 'athlete/create' || modalidades !== undefined) {
      if (!Array.isArray(modalidades) || !modalidades.length) {
        throw new ForbiddenException(
          `O gestor precisa informar a modalidade ${nomeProprio} ao cadastrar o atleta.`,
        );
      }
      const fora = modalidades.filter((item) => item !== nomeProprio);
      if (fora.length) {
        throw new ForbiddenException(
          `O gestor só pode vincular o atleta à modalidade ${nomeProprio}.`,
        );
      }
    }

    if (actionType === 'athlete/update') {
      const id = actionId(payload, 'id', 'O ID do atleta');
      const jaEDele = await transaction.editionRoster.findFirst({
        where: { athleteId: id, editionDisciplineId: scope.editionDisciplineId },
        select: { id: true },
      });
      if (!jaEDele) {
        throw new ForbiddenException(
          `O atleta não pertence à modalidade ${nomeProprio}. Peça ao administrador da edição.`,
        );
      }
    }
  }

  private async authorizeEditionAdminStaff(
    transaction: Prisma.TransactionClient,
    editionId: string,
    scope: SnapshotScope,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (scope.kind !== 'full') {
      throw new ForbiddenException('Gestores de modalidade não podem administrar o staff.');
    }
    const email = actionEmail(payload, 'email', 'O e-mail do membro');
    const member = actionObject(payload.member, 'O membro do staff');
    const role = actionString(member, 'role', 'O papel do membro', { min: 1, max: 80 });
    if (role !== 'Gestor de modalidade') {
      throw new ForbiddenException(
        'O administrador da edição pode conceder apenas o papel de gestor de modalidade.',
      );
    }
    const scopeName = actionString(member, 'scope', 'O escopo do membro', {
      min: 1,
      max: 160,
    });
    const [target, discipline] = await Promise.all([
      transaction.staff.findUnique({
        where: { email },
        select: {
          id: true,
          isSuperAdmin: true,
          editionRoles: {
            where: {
              editionId,
              role: 'EDITION_ADMIN',
              revokedAt: null,
            },
            select: { id: true },
            take: 1,
          },
        },
      }),
      transaction.editionDiscipline.findFirst({
        where: { editionId, discipline: { name: scopeName } },
        select: { id: true },
      }),
    ]);
    if (!discipline) {
      throw new NotFoundException('A modalidade do escopo não pertence a esta edição.');
    }
    if (target?.isSuperAdmin || target?.editionRoles.length) {
      throw new ForbiddenException(
        'O administrador da edição não pode alterar super administradores nem outros administradores.',
      );
    }
  }

  private async targetDisciplineId(
    transaction: Prisma.TransactionClient,
    editionId: string,
    actionType: EditionActionType,
    payload: Record<string, unknown>,
  ): Promise<string> {
    if (actionType === 'discipline/update') {
      const name = actionString(payload, 'name', 'O nome da modalidade', { min: 2, max: 100 });
      const discipline = await transaction.editionDiscipline.findFirst({
        where: { editionId, discipline: { name } },
        select: { id: true },
      });
      if (!discipline) throw new NotFoundException('A modalidade não pertence a esta edição.');
      return discipline.id;
    }
    if (actionType.startsWith('category/')) {
      if (actionType === 'category/create') {
        const category = actionObject(payload.category, 'A categoria');
        const name = actionString(category, 'discipline', 'A modalidade', { min: 2, max: 100 });
        const discipline = await transaction.editionDiscipline.findFirst({
          where: { editionId, discipline: { name } },
          select: { id: true },
        });
        if (!discipline) throw new NotFoundException('A modalidade não pertence a esta edição.');
        return discipline.id;
      }
      const tournamentId = actionId(payload, 'id', 'O ID da categoria');
      const tournament = await transaction.tournament.findFirst({
        where: { id: tournamentId, editionDiscipline: { editionId } },
        select: { editionDisciplineId: true },
      });
      if (!tournament) throw new NotFoundException('Categoria não encontrada nesta edição.');
      return tournament.editionDisciplineId;
    }
    if (actionType === 'match/schedule') {
      const match = actionObject(payload.match, 'A partida');
      const tournamentId = actionId(match, 'tournamentId', 'O ID da categoria');
      const tournament = await transaction.tournament.findFirst({
        where: { id: tournamentId, editionDiscipline: { editionId } },
        select: { editionDisciplineId: true },
      });
      if (!tournament) throw new NotFoundException('Categoria não encontrada nesta edição.');
      return tournament.editionDisciplineId;
    }
    const matchId = actionId(payload, 'id', 'O ID da partida');
    const match = await transaction.match.findFirst({
      where: {
        id: matchId,
        phase: { tournament: { editionDiscipline: { editionId } } },
      },
      select: { phase: { select: { tournament: { select: { editionDisciplineId: true } } } } },
    });
    if (!match) throw new NotFoundException('Partida não encontrada nesta edição.');
    return match.phase.tournament.editionDisciplineId;
  }

  private async advisoryLock(transaction: Prisma.TransactionClient, key: string): Promise<void> {
    await transaction.$queryRaw<Array<{ locked: number }>>`
      SELECT 1::int AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))
    `;
  }

  private actionType(value: string): EditionActionType {
    if (!EDITION_ACTION_TYPES.includes(value as EditionActionType)) {
      throw new BadRequestException(`Tipo de ação desconhecido: ${value}.`);
    }
    return value as EditionActionType;
  }

  private idempotencyKey(value: string | undefined): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('O header Idempotency-Key é obrigatório.');
    }
    const normalized = value.trim();
    if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `O header Idempotency-Key deve ter no máximo ${MAX_IDEMPOTENCY_KEY_LENGTH} caracteres.`,
      );
    }
    return normalized;
  }

  private requestHash(
    action: EditionActionDto,
    role?: RequestedEditionRole,
    editionDisciplineId?: string,
    operatorDeviceId?: string,
  ): string {
    const body = {
      type: action.type,
      payload: action.payload,
      ...(action.audit ? { audit: action.audit } : {}),
      role: role ?? null,
      scope: editionDisciplineId ?? null,
      operatorDeviceId: operatorDeviceId ?? null,
    };
    return createHash('sha256').update(this.canonicalJson(body)).digest('hex');
  }

  private canonicalJson(value: unknown): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.canonicalJson(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter((entry) => entry[1] !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
      return `{${entries
        .map(([key, item]) => `${JSON.stringify(key)}:${this.canonicalJson(item)}`)
        .join(',')}}`;
    }
    throw new BadRequestException('O corpo da ação possui um valor não serializável.');
  }

  private receiptEnvelope(
    value: Prisma.JsonValue | null,
    user: AuthenticatedUser,
  ): SnapshotEnvelopeDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InternalServerErrorException(
        'O recibo idempotente não possui uma resposta válida.',
      );
    }
    const record = value as Record<string, unknown>;
    if (record._actorId !== undefined && record._actorId !== user.id) {
      throw new ForbiddenException(
        'A chave de idempotência pertence a outro usuário e não pode ser reutilizada.',
      );
    }
    if (record._actorId === undefined && !user.isSuperAdmin) {
      throw new ForbiddenException(
        'O recibo idempotente não pode ser reutilizado por este usuário.',
      );
    }
    const meta = record.meta;
    if (
      !this.isFrontendSnapshot(record.data) ||
      !meta ||
      typeof meta !== 'object' ||
      Array.isArray(meta) ||
      typeof (meta as Record<string, unknown>).revision !== 'number'
    ) {
      throw new InternalServerErrorException(
        'O recibo idempotente não possui uma resposta válida.',
      );
    }
    return { data: record.data, meta } as SnapshotEnvelopeDto;
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
      Array.isArray(snapshot.audit)
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private isSerializableConflict(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
  }

  private mapPrismaError(error: unknown): unknown {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;
    if (error.code === 'P2002') {
      return new ConflictException('A ação conflita com um registro já existente.');
    }
    if (error.code === 'P2003') {
      return new BadRequestException('A ação referencia um registro inválido ou protegido.');
    }
    return error;
  }
}
