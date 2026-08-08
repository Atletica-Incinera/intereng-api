import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ScopeResolverStrategy,
  AuthenticatedRequest,
  ResolvedScope,
} from './scope-resolver.interface';

// Re-export interface types for backward compatibility
export * from './scope-resolver.interface';

import { EditionScopeResolver } from './strategies/edition-scope.resolver';
import { DisciplineScopeResolver } from './strategies/discipline-scope.resolver';
import { TournamentScopeResolver } from './strategies/tournament-scope.resolver';
import { PhaseScopeResolver } from './strategies/phase-scope.resolver';
import { MatchScopeResolver } from './strategies/match-scope.resolver';
import { EditionDisciplineScopeResolver } from './strategies/edition-discipline-scope.resolver';
import { EditionRosterScopeResolver } from '../../edition-rosters/edition-roster-scope.resolver';

export { EditionScopeResolver } from './strategies/edition-scope.resolver';
export { DisciplineScopeResolver } from './strategies/discipline-scope.resolver';
export { TournamentScopeResolver } from './strategies/tournament-scope.resolver';
export { PhaseScopeResolver } from './strategies/phase-scope.resolver';
export { MatchScopeResolver } from './strategies/match-scope.resolver';
export { EditionDisciplineScopeResolver } from './strategies/edition-discipline-scope.resolver';

export const SCOPE_RESOLVER_STRATEGY = 'SCOPE_RESOLVER_STRATEGY';

export const SCOPE_RESOLVER_STRATEGIES = [
  EditionScopeResolver,
  DisciplineScopeResolver,
  TournamentScopeResolver,
  PhaseScopeResolver,
  MatchScopeResolver,
  EditionDisciplineScopeResolver,
  EditionRosterScopeResolver,
];

export const ScopeResolverStrategyProvider = {
  provide: SCOPE_RESOLVER_STRATEGY,
  useFactory: (...strategies: ScopeResolverStrategy[]) => strategies,
  inject: SCOPE_RESOLVER_STRATEGIES,
};

/**
 * ScopeResolverService manages scope resolution strategies.
 * It dynamically resolves entity scopes for authorization purposes,
 * adhering to the Single Responsibility Principle and Open/Closed Principle.
 */
@Injectable()
export class ScopeResolverService {
  private readonly strategies: Record<string, ScopeResolverStrategy> = {};

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCOPE_RESOLVER_STRATEGY)
    strategies: ScopeResolverStrategy[],
  ) {
    for (const strategy of strategies) {
      this.strategies[strategy.type] = strategy;
    }
  }

  /**
   * Resolves the edition and discipline scope from the given entity metadata.
   *
   * @param entityType The type of entity (e.g. 'edition', 'discipline', 'tournament', 'phase', 'match', 'editionDiscipline', 'editionRoster')
   * @param value The ID/Value of the scope parameter
   * @param request The NestJS execution request context
   * @returns The resolved editionId and/or disciplineId
   */
  async resolveScope(
    entityType: string,
    value: string,
    request: AuthenticatedRequest,
  ): Promise<ResolvedScope> {
    const strategy = this.strategies[entityType];
    if (!strategy) {
      return {};
    }
    return strategy.resolve(value, request, this.prisma);
  }
}
