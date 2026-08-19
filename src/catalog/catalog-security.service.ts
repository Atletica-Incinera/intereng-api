import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { EditionStaffRoleType } from '@prisma/client';

/**
 * Service responsible for enforcing authorization and role-based permissions
 * regarding the global sports management catalog (Teams & Athletes).
 */
@Injectable()
export class CatalogSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks if the requesting user has administrator privileges.
   * Admin status is granted to SuperAdmins or users with the `EDITION_ADMIN` role in any edition.
   *
   * @param staffId The unique identifier of the staff member.
   * @param isSuperAdmin Boolean flag indicating if the staff member is a SuperAdmin.
   * @returns A promise resolving to true if the user is an administrator, false otherwise.
   */
  async checkIsAdmin(staffId: string, isSuperAdmin: boolean): Promise<boolean> {
    if (isSuperAdmin) {
      return true;
    }
    const role = await this.prisma.editionStaffRole.findFirst({
      where: {
        staffId,
        role: EditionStaffRoleType.EDITION_ADMIN,
        revokedAt: null,
      },
    });
    return !!role;
  }

  /**
   * Verifies if the requesting user has administrative rights to manage the global catalog
   * (e.g., creating teams or athletes).
   *
   * Rules:
   * - A user must be either a SuperAdmin or have the `EDITION_ADMIN` role in at least one edition.
   *
   * Reuses {@link checkIsAdmin} to enforce DRY principles.
   *
   * @param staffId The unique identifier of the requesting staff member.
   * @param isSuperAdmin Boolean flag indicating if the staff member is a SuperAdmin.
   * @returns A promise that resolves if the user is authorized.
   * @throws ForbiddenException If the user lacks the necessary administrative permissions.
   */
  async checkCanManageCatalog(staffId: string, isSuperAdmin: boolean): Promise<void> {
    const isAdmin = await this.checkIsAdmin(staffId, isSuperAdmin);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Acesso negado. Apenas EDITION_ADMIN ou SuperAdmin podem gerenciar o catálogo.',
      );
    }
  }
}
