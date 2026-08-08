import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is an EditionDiscipline mapping.
 */
@Injectable()
export class EditionDisciplineScopeResolver implements ScopeResolverStrategy {
  readonly type = 'editionDiscipline';

  /**
   * Resolves the edition and discipline scope from an editionDiscipline mapping ID.
   */
  async resolve(value: string, request: unknown, prisma: PrismaService): Promise<ResolvedScope> {
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
