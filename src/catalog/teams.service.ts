import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { Team, Prisma } from '@prisma/client';
import { CatalogSecurityService } from './catalog-security.service';

/**
 * Service responsible for managing teams inside the global catalog.
 * Handles the creation, retrieval, and pagination of teams, complying with SRP.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly security: CatalogSecurityService,
  ) {}

  /**
   * Creates a new Team in the global catalog and records an audit log.
   *
   * Business Rules:
   * - Requires EDITION_ADMIN or SuperAdmin role.
   * - Slugs must be unique across all teams.
   *
   * @param dto The details of the team to create.
   * @param staffId The ID of the staff member creating the team.
   * @param isSuperAdmin Whether the staff member is a SuperAdmin.
   * @returns A promise resolving to the newly created Team entity.
   * @throws ForbiddenException If the creator lacks catalog management rights.
   * @throws ConflictException If a team with the specified slug already exists.
   */
  async createTeam(dto: CreateTeamDto, staffId: string, isSuperAdmin: boolean): Promise<Team> {
    await this.security.checkCanManageCatalog(staffId, isSuperAdmin);

    const existing = await this.prisma.team.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Equipe com slug "${dto.slug}" já existe.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: dto.name,
          slug: dto.slug,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId: null,
          action: 'CREATE',
          entityType: 'Team',
          entityId: team.id,
          before: null,
          after: team,
        },
        tx,
      );

      return team;
    });
  }

  /**
   * Retrieves a paginated list of teams, with optional name or slug search.
   *
   * @param query The pagination options.
   * @param search Optional case-insensitive search term for name or slug.
   * @returns A promise resolving to a paginated result containing Team entities.
   */
  async findAllTeams(query: PaginationQueryDto, search?: string): Promise<PaginatedResult<Team>> {
    const where: Prisma.TeamWhereInput = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    return paginate(this.prisma.team, {
      page: query.page,
      pageSize: query.pageSize,
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Retrieves a specific team by its unique identifier.
   *
   * @param id The unique identifier of the team.
   * @returns A promise resolving to the found Team entity.
   * @throws NotFoundException If the team cannot be found.
   */
  async findTeamById(id: string): Promise<Team> {
    const team = await this.prisma.team.findUnique({
      where: { id },
    });
    if (!team) {
      throw new NotFoundException(`Equipe com ID "${id}" não encontrada.`);
    }
    return team;
  }
}
