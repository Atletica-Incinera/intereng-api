import { Injectable } from '@nestjs/common';
import { ScopeResolverStrategy, ResolvedScope } from '../common/guards/scope-resolver.interface';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Strategy to resolve the scope when the target entity is an EditionRoster mapping.
 */
@Injectable()
export class EditionRosterScopeResolver implements ScopeResolverStrategy {
  readonly type = 'editionRoster';

  /**
   * Resolves the edition and discipline scope from an EditionRoster ID.
   *
   * @param value The roster ID
   * @param request The NestJS execution request context
   * @param prisma The Prisma client
   * @returns Object containing resolved editionId and disciplineId
   */
  async resolve(
    value: string,
    request: unknown,
    prisma: PrismaService,
  ): Promise<ResolvedScope> {
    const roster = await prisma.editionRoster.findUnique({
      where: { id: value },
      include: {
        editionDiscipline: true,
      },
    });
    if (roster?.editionDiscipline) {
      return {
        editionId: roster.editionDiscipline.editionId,
        disciplineId: roster.editionDiscipline.disciplineId,
      };
    }
    return {};
  }
}
