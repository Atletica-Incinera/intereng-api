import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Represents the structure of the authenticated request parsed by NestJS/Express.
 */
export interface AuthenticatedRequest {
  /** Route parameters */
  params?: Record<string, string | undefined>;
  /** Request body parameters */
  body?: Record<string, unknown>;
  /** Request query string parameters */
  query?: Record<string, unknown>;
}

/**
 * Represents the scope resolved from the requested entity.
 */
export interface ResolvedScope {
  /** The ID of the edition associated with the scope */
  editionId?: string;
  /** The ID of the discipline associated with the scope, if any */
  disciplineId?: string;
}

/**
 * Interface defining the strategy contract for resolving scopes of specific entity types.
 */
export interface ScopeResolverStrategy {
  /**
   * Resolves the edition and discipline IDs based on the entity ID value.
   *
   * @param value The primary ID value of the entity to resolve
   * @param request The HTTP request containing parameters, body, or query
   * @param prisma The Prisma service to access the database
   */
  resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope>;
}

/**
 * Strategy to resolve the scope when the target entity is an Edition.
 */
@Injectable()
export class EditionScopeResolver implements ScopeResolverStrategy {
  resolve(value: string): Promise<ResolvedScope> {
    return Promise.resolve({ editionId: value });
  }
}

/**
 * Strategy to resolve the scope when the target entity is a Discipline.
 */
@Injectable()
export class DisciplineScopeResolver implements ScopeResolverStrategy {
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const disciplineId = value;
    // Check if editionId is explicitly provided in the request
    let editionId =
      request.params?.editionId ||
      (request.body?.editionId as string | undefined) ||
      (request.query?.editionId as string | undefined);
    if (!editionId) {
      const ed = await prisma.editionDiscipline.findFirst({
        where: { disciplineId },
      });
      if (ed) {
        editionId = ed.editionId;
      }
    }
    return { editionId, disciplineId };
  }
}

/**
 * Strategy to resolve the scope when the target entity is a Tournament.
 */
@Injectable()
export class TournamentScopeResolver implements ScopeResolverStrategy {
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: value },
      include: { editionDiscipline: true },
    });
    if (tournament?.editionDiscipline) {
      return {
        editionId: tournament.editionDiscipline.editionId,
        disciplineId: tournament.editionDiscipline.disciplineId,
      };
    }
    return {};
  }
}

/**
 * Strategy to resolve the scope when the target entity is a Phase.
 */
@Injectable()
export class PhaseScopeResolver implements ScopeResolverStrategy {
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const phase = await prisma.phase.findUnique({
      where: { id: value },
      include: {
        tournament: {
          include: { editionDiscipline: true },
        },
      },
    });
    if (phase?.tournament?.editionDiscipline) {
      return {
        editionId: phase.tournament.editionDiscipline.editionId,
        disciplineId: phase.tournament.editionDiscipline.disciplineId,
      };
    }
    return {};
  }
}

/**
 * Strategy to resolve the scope when the target entity is a Match.
 */
@Injectable()
export class MatchScopeResolver implements ScopeResolverStrategy {
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const match = await prisma.match.findUnique({
      where: { id: value },
      include: {
        phase: {
          include: {
            tournament: {
              include: { editionDiscipline: true },
            },
          },
        },
      },
    });
    if (match?.phase?.tournament?.editionDiscipline) {
      return {
        editionId: match.phase.tournament.editionDiscipline.editionId,
        disciplineId: match.phase.tournament.editionDiscipline.disciplineId,
      };
    }
    return {};
  }
}

/**
 * Strategy to resolve the scope when the target entity is an EditionDiscipline mapping.
 */
@Injectable()
export class EditionDisciplineScopeResolver implements ScopeResolverStrategy {
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const ed = await prisma.editionDiscipline.findUnique({
      where: { id: value },
    });
    if (ed) {
      return {
        editionId: ed.editionId,
        disciplineId: ed.disciplineId,
      };
    }
    return {};
  }
}

/**
 * ScopeResolverService manages scope resolution strategies.
 * It dynamically resolves entity scopes for authorization purposes,
 * adhering to the Single Responsibility Principle and Open/Closed Principle.
 */
@Injectable()
export class ScopeResolverService {
  private readonly strategies: Record<string, ScopeResolverStrategy>;

  constructor(private readonly prisma: PrismaService) {
    this.strategies = {
      edition: new EditionScopeResolver(),
      discipline: new DisciplineScopeResolver(),
      tournament: new TournamentScopeResolver(),
      phase: new PhaseScopeResolver(),
      match: new MatchScopeResolver(),
      editionDiscipline: new EditionDisciplineScopeResolver(),
    };
  }

  /**
   * Resolves the edition and discipline scope from the given entity metadata.
   *
   * @param entityType The type of entity (e.g. 'edition', 'discipline', 'tournament', 'phase', 'match', 'editionDiscipline')
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
