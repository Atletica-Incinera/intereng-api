import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCompetitionDto } from './dto/create-competition.dto';
import { CreateEditionDto } from './dto/create-edition.dto';
import { UpdateEditionDto } from './dto/update-edition.dto';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Competition, CompetitionEdition, EditionStatus } from '@prisma/client';

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new Competition.
   */
  async create(dto: CreateCompetitionDto): Promise<Competition> {
    return this.prisma.competition.create({
      data: {
        name: dto.name,
        slug: dto.slug,
      },
    });
  }

  /**
   * Lists competitions with pagination.
   */
  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<Competition>> {
    return paginate(this.prisma.competition, {
      page: query.page,
      pageSize: query.pageSize,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Retrieves a single competition by ID.
   * Throws NotFoundException if it doesn't exist.
   */
  async findOne(id: string): Promise<Competition> {
    const competition = await this.prisma.competition.findUnique({
      where: { id },
    });

    if (!competition) {
      throw new NotFoundException(`Competição com ID "${id}" não encontrada.`);
    }

    return competition;
  }

  /**
   * Creates a new edition for a given competition.
   */
  async createEdition(competitionId: string, dto: CreateEditionDto): Promise<CompetitionEdition> {
    // Verify competition exists
    await this.findOne(competitionId);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    this.validateEditionDates(startDate, endDate);

    return this.prisma.competitionEdition.create({
      data: {
        competitionId,
        year: dto.year,
        name: dto.name,
        startDate,
        endDate,
        status: EditionStatus.PLANNING,
      },
    });
  }

  /**
   * Retrieves all editions for a competition.
   */
  async findEditionsByCompetitionId(competitionId: string): Promise<CompetitionEdition[]> {
    // Verify competition exists
    await this.findOne(competitionId);

    return this.prisma.competitionEdition.findMany({
      where: { competitionId },
      orderBy: { year: 'desc' },
    });
  }

  /**
   * Retrieves a single edition by ID.
   */
  async findEditionById(id: string): Promise<CompetitionEdition> {
    const edition = await this.prisma.competitionEdition.findUnique({
      where: { id },
    });

    if (!edition) {
      throw new NotFoundException(`Edição com ID "${id}" não encontrada.`);
    }

    return edition;
  }

  /**
   * Updates an edition's details by its ID.
   * Checks if the edition exists and validates that the updated end date remains after the start date.
   *
   * @param id The unique identifier of the edition to update.
   * @param dto The data transfer object containing the update payload.
   * @returns A promise resolving to the updated CompetitionEdition.
   * @throws NotFoundException if the edition with the specified ID does not exist.
   * @throws BadRequestException if the updated end date is not posterior to the start date.
   */
  async updateEdition(id: string, dto: UpdateEditionDto): Promise<CompetitionEdition> {
    const edition = await this.findEditionById(id);

    const newStartDate = dto.startDate ? new Date(dto.startDate) : edition.startDate;
    const newEndDate = dto.endDate ? new Date(dto.endDate) : edition.endDate;

    this.validateEditionDates(newStartDate, newEndDate);

    return this.prisma.competitionEdition.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.startDate ? { startDate: newStartDate } : {}),
        ...(dto.endDate ? { endDate: newEndDate } : {}),
      },
    });
  }

  /**
   * Updates the status of an edition by its ID.
   * Verifies the existence of the edition before modifying the status.
   *
   * @param id The unique identifier of the edition.
   * @param status The new status to be applied to the edition.
   * @returns A promise resolving to the updated CompetitionEdition with the new status.
   * @throws NotFoundException if the edition with the specified ID does not exist.
   */
  async updateEditionStatus(id: string, status: EditionStatus): Promise<CompetitionEdition> {
    await this.findEditionById(id);

    return this.prisma.competitionEdition.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Validates if the end date is after the start date.
   * @param startDate The start date of the edition
   * @param endDate The end date of the edition
   * @throws BadRequestException if the end date is less than or equal to the start date
   */
  private validateEditionDates(startDate: Date, endDate: Date): void {
    if (endDate <= startDate) {
      throw new BadRequestException('A data de término deve ser posterior à data de início.');
    }
  }
}
