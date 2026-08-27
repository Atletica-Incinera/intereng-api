import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ResolvedEdition } from '../edition-snapshots/active-edition.resolver';
import { SnapshotEnvelopeDto } from '../edition-snapshots/dto/frontend-snapshot.dto';
import { SnapshotScope } from '../edition-snapshots/snapshot.mapper';
import { EditionActionAuditDto } from './dto/edition-action.dto';

export const EDITION_ACTION_TYPES = [
  'match/schedule',
  'match/update',
  'match/start',
  'match/updateClock',
  'match/registerEvent',
  'match/claimOperator',
  'match/releaseOperator',
  'match/undoEvent',
  'match/finish',
  'match/correctResult',
  'category/create',
  'category/update',
  'category/generateMatches',
  'discipline/update',
  'discipline/delete',
  'team/create',
  'team/update',
  'athlete/create',
  'athlete/update',
  'ranking/addMetric',
  'ranking/updateMetric',
  'ranking/removeMetric',
  'ranking/seedDefaultMetrics',
  'ranking/addAwards',
  'ranking/revokeAward',
  'ranking/close',
  'ranking/reopen',
  'competition/create',
  'competition/rename',
  'competition/activate',
  'edition/create',
  'edition/update',
  'edition/activate',
  'staff/upsert',
  'staff/remove',
  'staff/promoteSuperAdmin',
] as const;

export type EditionActionType = (typeof EDITION_ACTION_TYPES)[number];

export interface EditionActionContext {
  transaction: Prisma.TransactionClient;
  edition: ResolvedEdition;
  user: AuthenticatedUser;
  actorName: string;
  scope: SnapshotScope;
  operatorDeviceId?: string;
}

export interface ActionMutationResult {
  entityType: string;
  entityId: string;
  editionDisciplineId?: string;
  responseEditionId?: string;
  affectedEditionIds?: string[];
}

export type EditionActionHandler = (
  context: EditionActionContext,
  payload: Record<string, unknown>,
  audit?: EditionActionAuditDto,
) => Promise<ActionMutationResult>;

export type EditionActionRegistry = Record<EditionActionType, EditionActionHandler>;

export interface EditionActionExecutionResult {
  envelope: SnapshotEnvelopeDto;
  statusCode: 200 | 201;
}
