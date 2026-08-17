import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEditionStaffRoleDto } from '../dto/create-edition-staff-role.dto';
import { RoleValidationStrategy } from './role-validation-strategy.interface';

/**
 * Strategy to validate DISCIPLINE_MANAGER role assignments.
 * Ensures the provided discipline exists and is associated with the edition.
 */
export class DisciplineManagerValidationStrategy implements RoleValidationStrategy {
  async validate(
    editionId: string,
    dto: CreateEditionStaffRoleDto,
    prisma: PrismaService,
  ): Promise<{ editionDisciplineId: string | null }> {
    if (!dto.disciplineId) {
      throw new BadRequestException('DISCIPLINE_MANAGER exige uma modalidade associada.');
    }

    // Verify if discipline exists
    const discipline = await prisma.discipline.findUnique({
      where: { id: dto.disciplineId },
    });
    if (!discipline) {
      throw new NotFoundException(`Modalidade com ID "${dto.disciplineId}" não encontrada.`);
    }

    // Verify if association exists between edition and discipline
    const editionDiscipline = await prisma.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: {
          editionId,
          disciplineId: dto.disciplineId,
        },
      },
    });
    if (!editionDiscipline) {
      throw new NotFoundException(
        `Modalidade com ID "${dto.disciplineId}" não está associada à edição "${editionId}".`,
      );
    }
    return { editionDisciplineId: editionDiscipline.id };
  }
}
