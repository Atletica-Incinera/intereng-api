import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateEditionStaffRoleDto } from './dto/create-edition-staff-role.dto';
import { EditionStaffRoleWithRelations } from './edition-staff-roles.mapper';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EditionStaffRoleType } from '@prisma/client';
import { ROLE_VALIDATION_STRATEGIES } from './strategies';

/**
 * Interface defining the contract for role validation strategies.
 * Implementations must provide a `validate` method that returns the associated
 * `editionDisciplineId` (or null) after performing necessary checks.
 *
 * @interface RoleValidationStrategy
 */
/**
 * @class EditionStaffRolesService
 * @description Service responsible for managing staff role assignments within competition editions.
 * Provides methods to list, create, and delete staff roles while enforcing business rules,
 * authorization checks, and relational integrity.
 */
@Injectable()
export class EditionStaffRolesService {
  private static readonly STAFF_ROLE_INCLUDE = {
    edition: true,
    staff: true,
    editionDiscipline: {
      include: {
        discipline: true,
      },
    },
  } as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to verify if an edition exists.
   *
   * @param editionId Unique identifier of the competition edition
   * @throws NotFoundException If the edition does not exist
   */
  private async verifyEditionExists(editionId: string): Promise<void> {
    const edition = await this.prisma.competitionEdition.findUnique({
      where: { id: editionId },
    });
    if (!edition) {
      throw new NotFoundException(`Edição com ID "${editionId}" não encontrada.`);
    }
  }

  /**
   * Retrieves all staff roles assigned to a competition edition.
   *
   * @param editionId Unique identifier of the competition edition
   * @returns Array of staff role entries with loaded relations
   */
  async findEditionStaffRoles(editionId: string): Promise<EditionStaffRoleWithRelations[]> {
    await this.verifyEditionExists(editionId);

    return this.prisma.editionStaffRole.findMany({
      where: { editionId },
      include: EditionStaffRolesService.STAFF_ROLE_INCLUDE,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Checks whether the acting user has sufficient privileges to create or delete a staff role.
   *
   * @param role The role being assigned or removed.
   * @param actor The authenticated user performing the operation.
   * @param action The action being performed, either 'create' or 'delete'.
   * @throws ForbiddenException if a non-superadmin attempts to assign or remove an EDITION_ADMIN role.
   */
  private checkPrivileges(
    role: EditionStaffRoleType,
    actor: AuthenticatedUser,
    action: 'create' | 'delete',
  ): void {
    if (role === EditionStaffRoleType.EDITION_ADMIN && !actor.isSuperAdmin) {
      const verb = action === 'create' ? 'criar' : 'remover um';
      throw new ForbiddenException(`Apenas SuperAdmin pode ${verb} EDITION_ADMIN.`);
    }
  }

  /**
   * Assigns a staff role (EDITION_ADMIN or DISCIPLINE_MANAGER) to a staff member in a competition edition.
   * Validates several business/authorization rules:
   * 1. Check permission bypass/restriction (EDITION_ADMIN assignment requires global SuperAdmin).
   * 2. Verify target staff member exists.
   * 3. Validate relation matching:
   *    - EDITION_ADMIN roles cannot have a discipline associated (must be null/omitted).
   *    - DISCIPLINE_MANAGER roles require a valid discipline associated with the competition edition.
   * 4. Enforce uniqueness to prevent duplicate assignments of the same role context.
   *
   * @param editionId Unique identifier of the competition edition
   * @param dto Create DTO containing staffId, role, and disciplineId
   * @param actor The authenticated user performing this operation
   * @returns The created edition staff role record
   */
  async createEditionStaffRole(
    editionId: string,
    dto: CreateEditionStaffRoleDto,
    actor: AuthenticatedUser,
  ): Promise<EditionStaffRoleWithRelations> {
    await this.verifyEditionExists(editionId);

    // Conditional authorization check (DRY via helper)
    this.checkPrivileges(dto.role, actor, 'create');

    // Verify if the target staff exists
    const targetStaff = await this.prisma.staff.findUnique({
      where: { id: dto.staffId },
    });
    if (!targetStaff) {
      throw new NotFoundException(`Membro da equipe com ID "${dto.staffId}" não encontrado.`);
    }

    // Dynamic strategy validation (OCP)
    const strategy = ROLE_VALIDATION_STRATEGIES[dto.role];
    if (!strategy) {
      throw new BadRequestException(`Papel "${dto.role}" não suportado para validação.`);
    }
    const { editionDisciplineId, teamId } = await strategy.validate(editionId, dto, this.prisma);

    // Verify if duplicate exists
    const existingRole = await this.prisma.editionStaffRole.findFirst({
      where: {
        editionId,
        staffId: dto.staffId,
        editionDisciplineId,
        ...(teamId ? { teamId } : {}),
        role: dto.role,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingRole && !existingRole.revokedAt) {
      throw new ConflictException(
        `Este membro da equipe já possui o papel "${dto.role}" atribuído nesta modalidade/edição.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const role = existingRole
        ? await tx.editionStaffRole.update({
            where: { id: existingRole.id },
            data: { revokedAt: null, revokedById: null },
            include: EditionStaffRolesService.STAFF_ROLE_INCLUDE,
          })
        : await tx.editionStaffRole.create({
            data: {
              editionId,
              staffId: dto.staffId,
              editionDisciplineId,
              role: dto.role,
            },
            include: EditionStaffRolesService.STAFF_ROLE_INCLUDE,
          });

      await this.audit.record(
        {
          staffId: actor.id,
          editionId,
          action: existingRole ? 'RESTORE' : 'CREATE',
          entityType: 'EditionStaffRole',
          entityId: role.id,
          before: null,
          after: role,
        },
        tx,
      );

      return role;
    });
  }

  /**
   * Revokes a staff role by ID from a competition edition.
   * Validates edition ownership and conditional authorization rules (removing EDITION_ADMIN requires SuperAdmin).
   *
   * @param editionId Unique identifier of the competition edition
   * @param id Unique identifier of the staff role record to delete
   * @param actor The authenticated user performing the deletion
   */
  async deleteEditionStaffRole(
    editionId: string,
    id: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.verifyEditionExists(editionId);

    const existingRole = await this.prisma.editionStaffRole.findUnique({
      where: { id },
    });
    if (!existingRole) {
      throw new NotFoundException(`Papel de staff com ID "${id}" não encontrado.`);
    }

    if (existingRole.editionId !== editionId) {
      throw new BadRequestException('O papel solicitado não pertence à edição especificada.');
    }

    // Conditional authorization check (DRY via helper)
    this.checkPrivileges(existingRole.role, actor, 'delete');

    if (existingRole.revokedAt) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const revokedRole = await tx.editionStaffRole.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revokedById: actor.id,
        },
      });

      await this.audit.record(
        {
          staffId: actor.id,
          editionId,
          action: 'REVOKE',
          entityType: 'EditionStaffRole',
          entityId: id,
          before: existingRole,
          after: revokedRole,
        },
        tx,
      );
    });
  }
}
