import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope, AuthenticatedRequest } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is a Discipline.
 */
@Injectable()
export class DisciplineScopeResolver implements ScopeResolverStrategy {
  readonly type = 'discipline';

  /**
   * Resolves the edition and discipline scope from a discipline ID.
   */
  async resolve(
    value: string,
    request: AuthenticatedRequest,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const disciplineId = value;
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
