import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const EDITION_CONTEXT_SELECT = {
  id: true,
  competitionId: true,
  year: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  isActive: true,
  revision: true,
  competition: {
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
    },
  },
} as const;

export interface ResolvedEdition {
  id: string;
  competitionId: string;
  year: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'PLANNING' | 'ONGOING' | 'FINISHED' | 'ARCHIVED';
  isActive: boolean;
  revision: number;
  competition: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
}

@Injectable()
export class ActiveEditionResolver {
  async resolve(
    transaction: Prisma.TransactionClient,
    editionId: string,
  ): Promise<ResolvedEdition> {
    if (editionId !== 'active') {
      const edition = await transaction.competitionEdition.findUnique({
        where: { id: editionId },
        select: EDITION_CONTEXT_SELECT,
      });

      if (!edition) {
        throw new NotFoundException('Edição não encontrada.');
      }

      return edition;
    }

    const activeCompetitions = await transaction.competition.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 2,
      select: { id: true },
    });

    if (activeCompetitions.length !== 1) {
      throw new NotFoundException('Não foi possível determinar a competição ativa.');
    }

    const activeEditions = await transaction.competitionEdition.findMany({
      where: {
        competitionId: activeCompetitions[0].id,
        isActive: true,
      },
      orderBy: { id: 'asc' },
      take: 2,
      select: EDITION_CONTEXT_SELECT,
    });

    if (activeEditions.length !== 1) {
      throw new NotFoundException('Não foi possível determinar a edição ativa.');
    }

    return activeEditions[0];
  }
}
