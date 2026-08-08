import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is a Phase.
 */
@Injectable()
export class PhaseScopeResolver implements ScopeResolverStrategy {
  readonly type = 'phase';

  /**
   * Resolves the edition and discipline scope from a phase ID.
   */
  async resolve(value: string, request: unknown, prisma: PrismaService): Promise<ResolvedScope> {
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
