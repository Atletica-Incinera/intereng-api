import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is a Match.
 */
@Injectable()
export class MatchScopeResolver implements ScopeResolverStrategy {
  readonly type = 'match';

  /**
   * Resolves the edition and discipline scope from a match ID.
   */
  async resolve(value: string, request: unknown, prisma: PrismaService): Promise<ResolvedScope> {
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
