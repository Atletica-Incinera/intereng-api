import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateEditionStaffRoleDto } from '../dto/create-edition-staff-role.dto';

/**
 * Interface defining the contract for role validation strategies.
 * Implementations must provide a `validate` method that returns the associated
 * `editionDisciplineId` (or null) after performing necessary checks.
 */
export interface RoleValidationStrategy {
  validate(
    editionId: string,
    dto: CreateEditionStaffRoleDto,
    prisma: PrismaService,
  ): Promise<{ editionDisciplineId: string | null }>;
}
