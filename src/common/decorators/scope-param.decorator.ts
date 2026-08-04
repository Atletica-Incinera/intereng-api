import { SetMetadata } from '@nestjs/common';

/**
 * Metadata stored by the ScopeParam decorator.
 */
export interface ScopeParamMetadata {
  /** The name of the parameter in the request (e.g. 'editionId', 'matchId') */
  paramName: string;
  /** The entity type corresponding to the parameter, used to resolve edition/discipline IDs */
  entityType?: 'edition' | 'discipline' | 'tournament' | 'phase' | 'match' | 'editionDiscipline';
}

export const SCOPE_PARAM_KEY = 'scope-param';

/**
 * Decorator to define the request parameter name and entity type that identifies the scope
 * of the target resource for authorization checks.
 *
 * The `AuthorizationGuard` extracts this metadata to resolve the contextual `editionId` and `disciplineId`,
 * allowing it to enforce fine-grained role checks (e.g., verifying if a `DISCIPLINE_MANAGER` has access
 * to the specific discipline of the target match/phase/tournament).
 *
 * @param paramName The name of the key inside request parameters, body, or query string (e.g. 'matchId')
 * @param entityType The specific database entity type to resolve (e.g. 'match'). If omitted, the guard will attempt to infer it.
 */
export const ScopeParam = (
  paramName: string,
  entityType?: 'edition' | 'discipline' | 'tournament' | 'phase' | 'match' | 'editionDiscipline',
) => SetMetadata(SCOPE_PARAM_KEY, { paramName, entityType });
