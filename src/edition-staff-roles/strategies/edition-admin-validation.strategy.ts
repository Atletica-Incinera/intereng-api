import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEditionStaffRoleDto } from '../dto/create-edition-staff-role.dto';
import { RoleValidationStrategy } from './role-validation-strategy.interface';

export class EditionAdminValidationStrategy implements RoleValidationStrategy {
  validate(
    _editionId: string,
    dto: CreateEditionStaffRoleDto,
    _prisma: PrismaService,
  ): Promise<{ editionDisciplineId: string | null }> {
    if (dto.disciplineId !== undefined && dto.disciplineId !== null) {
      throw new BadRequestException('EDITION_ADMIN não deve possuir modalidade associada.');
    }
    return Promise.resolve({ editionDisciplineId: null });
  }
}
