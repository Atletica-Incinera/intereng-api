import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is a Tournament.
 */
@Injectable()
export class TournamentScopeResolver implements ScopeResolverStrategy {
  readonly type = 'tournament';

  /**
   * Resolves the edition and discipline scope from a tournament ID.
   */
  async resolve(value: string, request: unknown, prisma: PrismaService): Promise<ResolvedScope> {
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
