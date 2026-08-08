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
  /** The unique type of the entity this strategy handles */
  readonly type: string;

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
