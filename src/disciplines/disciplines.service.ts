import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateDisciplineDto } from './dto/create-discipline.dto';
import { CreateEditionDisciplineDto } from './dto/create-edition-discipline.dto';
import { UpdateEditionDisciplineDto } from './dto/update-edition-discipline.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { Discipline, Prisma, EditionStaffRoleType } from '@prisma/client';
import { EditionDisciplineWithRelation } from './disciplines.mapper';
import { EditionDisciplineConfigValidator } from './validation/edition-discipline-config.validator';

@Injectable()
export class DisciplinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to verify if a competition edition exists.
   * Throws NotFoundException if not found.
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
   * Creates a new Discipline in the global catalog.
   */
  async createDiscipline(
    dto: CreateDisciplineDto,
    staffId: string,
    isSuperAdmin: boolean,
  ): Promise<Discipline> {
    // Verify if user is SuperAdmin or has EDITION_ADMIN role in at least one edition
    if (!isSuperAdmin) {
      const hasEditionAdminRole = await this.prisma.editionStaffRole.findFirst({
        where: {
          staffId,
          role: EditionStaffRoleType.EDITION_ADMIN,
          revokedAt: null,
        },
      });
      if (!hasEditionAdminRole) {
        throw new ForbiddenException(
          'Acesso negado. Apenas EDITION_ADMIN ou SuperAdmin podem criar modalidades no catálogo global.',
        );
      }
    }

    const existing = await this.prisma.discipline.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Modalidade com slug "${dto.slug}" já existe.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const discipline = await tx.discipline.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          isIndividual: dto.isIndividual ?? false,
          description: dto.description ?? null,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: null,
          action: 'CREATE',
          entityType: 'Discipline',
          entityId: discipline.id,
          before: null,
          after: discipline,
        },
        tx,
      );

      return discipline;
    });
  }

  /**
   * Lists disciplines with pagination.
   */
  async findAllDisciplines(query: PaginationQueryDto): Promise<PaginatedResult<Discipline>> {
    return paginate(this.prisma.discipline, {
      page: query.page,
      pageSize: query.pageSize,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Finds a single discipline by ID.
   */
  async findDisciplineById(id: string): Promise<Discipline> {
    const discipline = await this.prisma.discipline.findUnique({
      where: { id },
    });
    if (!discipline) {
      throw new NotFoundException(`Modalidade com ID "${id}" não encontrada.`);
    }
    return discipline;
  }

  /**
   * Finds all disciplines associated with a competition edition.
   */
  async findEditionDisciplines(editionId: string): Promise<EditionDisciplineWithRelation[]> {
    await this.verifyEditionExists(editionId);

    return this.prisma.editionDiscipline.findMany({
      where: { editionId },
      include: { discipline: true },
      orderBy: { discipline: { name: 'asc' } },
    });
  }

  /**
   * Associates a discipline from the global catalog with a competition edition.
   */
  async associateDiscipline(
    editionId: string,
    dto: CreateEditionDisciplineDto,
    staffId: string,
  ): Promise<EditionDisciplineWithRelation> {
    // Verify edition exists
    await this.verifyEditionExists(editionId);

    // Verify discipline exists
    const discipline = await this.prisma.discipline.findUnique({
      where: { id: dto.disciplineId },
    });
    if (!discipline) {
      throw new NotFoundException(`Modalidade com ID "${dto.disciplineId}" não encontrada.`);
    }

    // Verify association doesn't exist yet
    const existing = await this.prisma.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: {
          editionId,
          disciplineId: dto.disciplineId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(`Modalidade já está associada a esta edição.`);
    }

    // Validate config shape dynamic JSON
    if (dto.config) {
      EditionDisciplineConfigValidator.validate(discipline.slug, dto.config);
    }

    return this.prisma.$transaction(async (tx) => {
      const association = await tx.editionDiscipline.create({
        data: {
          editionId,
          disciplineId: dto.disciplineId,
          config: (dto.config ?? Prisma.DbNull) as Prisma.InputJsonValue,
        },
        include: { discipline: true },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'EditionDiscipline',
          entityId: association.id,
          before: null,
          after: association,
        },
        tx,
      );

      return association;
    });
  }

  /**
   * Updates an edition-discipline association configuration.
   */
  async updateEditionDiscipline(
    editionId: string,
    id: string,
    dto: UpdateEditionDisciplineDto,
    staffId: string,
  ): Promise<EditionDisciplineWithRelation> {
    const existing = await this.prisma.editionDiscipline.findUnique({
      where: { id },
      include: { discipline: true },
    });

    if (!existing || existing.editionId !== editionId) {
      throw new NotFoundException(`Vínculo de modalidade não encontrado para esta edição.`);
    }

    // Validate config shape dynamic JSON
    if (dto.config) {
      EditionDisciplineConfigValidator.validate(existing.discipline.slug, dto.config);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.editionDiscipline.update({
        where: { id },
        data: {
          config: (dto.config !== undefined
            ? dto.config
            : (existing.config ?? Prisma.DbNull)) as Prisma.InputJsonValue,
        },
        include: { discipline: true },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'UPDATE',
          entityType: 'EditionDiscipline',
          entityId: id,
          before: existing,
          after: updated,
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Removes an edition-discipline association.
   */
  async deleteEditionDiscipline(
    editionId: string,
    disciplineId: string,
    staffId: string,
  ): Promise<void> {
    const existing = await this.prisma.editionDiscipline.findUnique({
      where: {
        editionId_disciplineId: {
          editionId,
          disciplineId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Vínculo de modalidade não encontrado para esta edição.`);
    }

    // Check database dependencies manually for a cleaner message if we want,
    // but the transaction will rollback anyway. Let's do transaction.
    await this.prisma.$transaction(async (tx) => {
      await tx.editionDiscipline.delete({
        where: {
          editionId_disciplineId: {
            editionId,
            disciplineId,
          },
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'DELETE',
          entityType: 'EditionDiscipline',
          entityId: existing.id,
          before: existing,
          after: null,
        },
        tx,
      );
    });
  }
}
