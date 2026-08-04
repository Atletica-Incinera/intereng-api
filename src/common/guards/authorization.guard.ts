import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { EditionStaffRoleType } from '@prisma/client';
import { SCOPE_PARAM_KEY, ScopeParamMetadata } from '../decorators/scope-param.decorator';
import { REQUIRE_ROLE_KEY } from '../decorators/require-role.decorator';
import { ScopeResolverService } from './scope-resolver.service';

interface AuthenticatedRequest {
  user?: {
    id: string;
    isSuperAdmin: boolean;
  };
  params?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * AuthorizationGuard enforces role-based access control (RBAC) across controller endpoints.
 *
 * Permission enforcement rules:
 * 1. **SuperAdmin Bypass**: If the authenticated user has `isSuperAdmin: true`, they are granted access.
 * 2. **Role Requirements**: If no role is requested using `@RequireRole`, access is allowed.
 * 3. **Scope Determination**: The target `editionId` and optional `disciplineId` are extracted from the
 *    request payload (params, body, query) using the metadata provided by `@ScopeParam`. If metadata is missing,
 *    parameter names and entity types are automatically inferred.
 * 4. **Role Resolution**: Access is granted if the user has the required role (or higher via inheritance)
 *    associated with the resolved edition (and discipline, if applicable):
 *    - `EDITION_ADMIN` role grants access to any resource within that edition, including all disciplines (inheritance).
 *    - `DISCIPLINE_MANAGER` role grants access only if it is mapped to the resolved `disciplineId`.
 */
@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  /**
   * Main guard validation hook. Determines if the request has sufficient privileges.
   *
   * @param context The NestJS execution context
   * @returns A promise resolving to true if the request is authorized, false otherwise
   * @throws UnauthorizedException if user object is not present in request
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User is not authenticated');
    }

    if (user.isSuperAdmin === true) {
      return true;
    }

    const requiredRole = this.reflector.getAllAndOverride<EditionStaffRoleType>(REQUIRE_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no role is required, allow access
    if (!requiredRole) {
      return true;
    }

    const scopeMetadata = this.reflector.getAllAndOverride<ScopeParamMetadata>(SCOPE_PARAM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    let paramName = 'editionId';
    let entityType: ScopeParamMetadata['entityType'] = 'edition';

    if (scopeMetadata) {
      paramName = scopeMetadata.paramName;
      entityType = scopeMetadata.entityType;
    }

    // Infer entity type if not specified
    if (!entityType) {
      if (paramName.endsWith('editionId') || paramName === 'editionId') {
        entityType = 'edition';
      } else if (paramName.endsWith('disciplineId') || paramName === 'disciplineId') {
        entityType = 'discipline';
      } else if (
        paramName.endsWith('tournamentId') ||
        paramName === 'tournamentId' ||
        paramName === 'tournament'
      ) {
        entityType = 'tournament';
      } else if (
        paramName.endsWith('phaseId') ||
        paramName === 'phaseId' ||
        paramName === 'phase'
      ) {
        entityType = 'phase';
      } else if (
        paramName.endsWith('matchId') ||
        paramName === 'matchId' ||
        paramName === 'match'
      ) {
        entityType = 'match';
      } else if (paramName.endsWith('editionDisciplineId') || paramName === 'editionDisciplineId') {
        entityType = 'editionDiscipline';
      } else {
        entityType = 'edition'; // Default fallback
      }
    }

    // Resolve parameter value
    const value = this.getValueFromRequest(request, paramName);
    if (!value) {
      return false;
    }

    // Delegate database scope resolution to ScopeResolverService (OCP / SRP compliance)
    const resolvedScope = await this.scopeResolver.resolveScope(entityType, value, request);
    const editionId = resolvedScope.editionId;
    let disciplineId = resolvedScope.disciplineId;

    if (!editionId) {
      return false;
    }

    // Retrieve user roles for this edition
    const staffRoles = await this.prisma.editionStaffRole.findMany({
      where: {
        staffId: user.id,
        editionId: editionId,
      },
      include: {
        editionDiscipline: true,
      },
    });

    if (requiredRole === EditionStaffRoleType.EDITION_ADMIN) {
      return staffRoles.some((r) => r.role === EditionStaffRoleType.EDITION_ADMIN);
    }

    if (requiredRole === EditionStaffRoleType.DISCIPLINE_MANAGER) {
      // EDITION_ADMIN always inherits DISCIPLINE_MANAGER permissions
      const isEditionAdmin = staffRoles.some((r) => r.role === EditionStaffRoleType.EDITION_ADMIN);
      if (isEditionAdmin) {
        return true;
      }

      if (!disciplineId) {
        disciplineId = this.getValueFromRequest(request, 'disciplineId');
      }

      if (!disciplineId) {
        return false;
      }

      return staffRoles.some(
        (r) =>
          r.role === EditionStaffRoleType.DISCIPLINE_MANAGER &&
          r.editionDiscipline?.disciplineId === disciplineId,
      );
    }

    return false;
  }

  /**
   * Extracts the value of a parameter name from route params, request body, or query search params.
   */
  private getValueFromRequest(req: AuthenticatedRequest, paramName: string): string | undefined {
    if (req.params && req.params[paramName] !== undefined) {
      return req.params[paramName];
    }
    if (req.body && req.body[paramName] !== undefined) {
      return req.body[paramName] as string;
    }
    if (req.query && req.query[paramName] !== undefined) {
      return req.query[paramName] as string;
    }
    return undefined;
  }
}
