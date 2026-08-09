import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CompetitionEdition, Tournament } from '@prisma/client';

@Injectable()
export class TournamentValidatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifies that a competition edition exists.
   * Throws NotFoundException if not found.
   */
  async verifyEditionExists(editionId: string): Promise<void> {
    const edition = await this.prisma.competitionEdition.findUnique({
      where: { id: editionId },
    });
    if (!edition) {
      throw new NotFoundException(`Edição com ID "${editionId}" não encontrada.`);
    }
  }

  /**
   * Verifies that a tournament name is unique within the given editionDiscipline.
   * Throws ConflictException if a tournament with the same name already exists.
   */
  async verifyTournamentNameUniqueness(editionDisciplineId: string, name: string): Promise<void> {
    const existing = await this.prisma.tournament.findUnique({
      where: {
        editionDisciplineId_name: {
          editionDisciplineId,
          name,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Torneio com nome "${name}" já existe na mesma edição e disciplina.`,
      );
    }
  }
}
