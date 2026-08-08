import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEditionStaffRoleDto } from '../dto/create-edition-staff-role.dto';

export interface RoleValidationStrategy {
  validate(
    editionId: string,
    dto: CreateEditionStaffRoleDto,
    prisma: PrismaService,
  ): Promise<{ editionDisciplineId: string | null }>;
}
