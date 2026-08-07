import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateAthleteDto } from './dto/create-athlete.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { Athlete, Prisma } from '@prisma/client';
import { storeDocument } from './security.utils';
import { CatalogSecurityService } from './catalog-security.service';

/**
 * Service responsible for managing athletes inside the global catalog.
 * Handles creation, lookup, pagination, and history queries for athlete records,
 * incorporating LGPD and security standards.
 */
@Injectable()
export class AthletesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly security: CatalogSecurityService,
  ) {}

  /**
   * Creates a new Athlete in the global catalog and records an audit log.
   *
   * Business Rules & LGPD Compliance:
   * - Requires EDITION_ADMIN or SuperAdmin role.
   * - The athlete's document (e.g. CPF/RG) is stored encrypted symmetrically (reversibly).
   * - A unique index is enforced on the encrypted representation of the document.
   * - Date of birth is normalized to a Date object.
   *
   * @param dto The athlete details to create.
   * @param staffId The ID of the staff member creating the athlete.
   * @param isSuperAdmin Whether the staff member is a SuperAdmin.
   * @returns A promise resolving to the created Athlete entity.
   * @throws ForbiddenException If the creator lacks catalog management rights.
   * @throws ConflictException If an athlete with the same document already exists.
   */
  async createAthlete(
    dto: CreateAthleteDto,
    staffId: string,
    isSuperAdmin: boolean,
  ): Promise<Athlete> {
    await this.security.checkCanManageCatalog(staffId, isSuperAdmin);

    const storedDoc = storeDocument(dto.document);
    const existing = await this.prisma.athlete.findUnique({
      where: { document: storedDoc },
    });
    if (existing) {
      throw new ConflictException(`Atleta com o documento informado já existe.`);
    }

    const birthDate = dto.birthDate ? new Date(dto.birthDate) : null;

    return this.prisma.$transaction(async (tx) => {
      const athlete = await tx.athlete.create({
        data: {
          name: dto.name,
          document: storedDoc,
          birthDate,
          email: dto.email || null,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: null,
          action: 'CREATE',
          entityType: 'Athlete',
          entityId: athlete.id,
          before: null,
          after: athlete,
        },
        tx,
      );

      return athlete;
    });
  }

  /**
   * Retrieves a paginated list of athletes, with optional name or email search.
   *
   * @param query The pagination options.
   * @param search Optional case-insensitive search term for name or email.
   * @returns A promise resolving to a paginated result containing Athlete entities.
   */
  async findAllAthletes(
    query: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<Athlete>> {
    const where: Prisma.AthleteWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    return paginate(this.prisma.athlete, {
      page: query.page,
      pageSize: query.pageSize,
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Retrieves a specific athlete by their unique identifier.
   *
   * @param id The unique identifier of the athlete.
   * @returns A promise resolving to the found Athlete entity.
   * @throws NotFoundException If the athlete cannot be found.
   */
  async findAthleteById(id: string): Promise<Athlete> {
    const athlete = await this.prisma.athlete.findUnique({
      where: { id },
    });
    if (!athlete) {
      throw new NotFoundException(`Atleta com ID "${id}" não encontrado.`);
    }
    return athlete;
  }

  /**
   * Retrieves the competition/edition participation history for an athlete.
   * Includes editions, disciplines, associated teams, jersey numbers, and status.
   *
   * @param athleteId The unique identifier of the athlete.
   * @returns A promise resolving to a list of participation records.
   * @throws NotFoundException If the athlete does not exist.
   */
  async findAthleteHistory(athleteId: string) {
    // Verify athlete existence first
    await this.findAthleteById(athleteId);

    const rosters = await this.prisma.editionRoster.findMany({
      where: { athleteId },
      include: {
        team: true,
        editionDiscipline: {
          include: {
            edition: true,
            discipline: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rosters.map((r) => ({
      editionName: r.editionDiscipline.edition.name,
      disciplineName: r.editionDiscipline.discipline.name,
      teamName: r.team?.name ?? null,
      jerseyNumber: r.jerseyNumber,
      status: r.status,
    }));
  }
}
