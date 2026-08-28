import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEditionStaffRoleDto } from '../dto/create-edition-staff-role.dto';
import { RoleValidationStrategy } from './role-validation-strategy.interface';

/**
 * Responsável de atlética: o papel se prende a uma equipe, e a equipe precisa
 * estar na edição. Vincular a uma equipe de fora daria acesso a um elenco que
 * não pertence a esta competição.
 */
export class TeamManagerValidationStrategy implements RoleValidationStrategy {
  async validate(
    editionId: string,
    dto: CreateEditionStaffRoleDto,
    prisma: PrismaService,
  ): Promise<{ editionDisciplineId: string | null; teamId: string | null }> {
    if (!dto.teamId) {
      throw new BadRequestException('TEAM_MANAGER exige uma equipe associada.');
    }
    const vinculo = await prisma.editionTeam.findUnique({
      where: { editionId_teamId: { editionId, teamId: dto.teamId } },
      select: { teamId: true },
    });
    if (!vinculo) {
      throw new NotFoundException(
        `Equipe com ID "${dto.teamId}" não está associada à edição "${editionId}".`,
      );
    }
    return { editionDisciplineId: null, teamId: vinculo.teamId };
  }
}
