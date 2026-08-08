import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../scope-resolver.interface';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is a Group.
 */
@Injectable()
export class GroupScopeResolver implements ScopeResolverStrategy {
  readonly type = 'group';

  /**
   * Resolves the edition and discipline scope from a group ID.
   */
  async resolve(value: string, request: unknown, prisma: PrismaService): Promise<ResolvedScope> {
    const group = await prisma.group.findUnique({
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
    if (group?.phase?.tournament?.editionDiscipline) {
      return {
        editionId: group.phase.tournament.editionDiscipline.editionId,
        disciplineId: group.phase.tournament.editionDiscipline.disciplineId,
      };
    }
    return {};
  }
}
