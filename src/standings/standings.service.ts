import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents, MatchFinishedEvent } from '../common/events';
import { MatchStatus, Prisma } from '@prisma/client';
import { StandingsCalculator } from './standings-calculator';

@Injectable()
export class StandingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recupera a tabela de classificação de uma fase específica, ordenada pela classificação (rank).
   *
   * @param phaseId O ID da fase cuja classificação deve ser obtida.
   * @returns Lista de inscrições classificadas com suas respectivas estatísticas e times/atletas.
   */
  async getStandings(phaseId: string) {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
    });

    if (!phase) {
      throw new NotFoundException(`Fase com ID "${phaseId}" não encontrada.`);
    }

    return this.prisma.phaseStanding.findMany({
      where: { phaseId },
      include: {
        entry: {
          include: {
            team: true,
            athlete: true,
          },
        },
      },
      orderBy: [{ rank: 'asc' }, { points: 'desc' }],
    });
  }

  /**
   * Intercepta o evento de término de partida para disparar automaticamente o recálculo da classificação.
   *
   * @param event O evento contendo o ID da fase associada à partida encerrada.
   */
  @OnEvent(DomainEvents.MATCH_FINISHED)
  async handleMatchFinished(event: MatchFinishedEvent): Promise<void> {
    await this.recomputeStandings(event.phaseId);
  }

  /**
   * Recalcula e persiste de forma atômica toda a classificação de uma determinada fase.
   * A classificação é calculada por grupo (caso a fase possua grupos) ou globalmente na fase.
   *
   * @param phaseId O ID da fase que será recalculada.
   */
  async recomputeStandings(phaseId: string): Promise<void> {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: {
        groups: {
          include: {
            entries: true,
          },
        },
        tournament: {
          include: {
            entries: true,
          },
        },
      },
    });

    if (!phase) {
      return;
    }

    const config = (phase.config as any) || {};
    const tiebreakers: string[] = config.tiebreakers || ['points', 'goalDiff'];

    let computedStandings: Prisma.PhaseStandingUncheckedCreateInput[] = [];

    // Estrutura para unificar o carregamento e execução dos cálculos (evitando duplicação - DRY)
    interface ComputeJob {
      entryIds: string[];
      matchWhere: Prisma.MatchWhereInput;
    }

    const jobs: ComputeJob[] = [];

    if (phase.groups && phase.groups.length > 0) {
      // A fase possui grupos: agendar cálculo para cada grupo de forma independente
      for (const group of phase.groups) {
        const entryIds = group.entries.map((e) => e.entryId);
        if (entryIds.length > 0) {
          jobs.push({
            entryIds,
            matchWhere: {
              groupId: group.id,
              status: {
                in: [MatchStatus.FINISHED, MatchStatus.WALKOVER],
              },
            },
          });
        }
      }
    } else {
      // A fase não possui grupos: agendar cálculo global para toda a fase
      const entryIds = phase.tournament.entries.map((e) => e.id);
      if (entryIds.length > 0) {
        jobs.push({
          entryIds,
          matchWhere: {
            phaseId,
            groupId: null,
            status: {
              in: [MatchStatus.FINISHED, MatchStatus.WALKOVER],
            },
          },
        });
      }
    }

    // Executa os jobs mapeados
    for (const job of jobs) {
      const matches = await this.prisma.match.findMany({
        where: job.matchWhere,
      });

      const standings = StandingsCalculator.computeStandingsForSubset(
        phaseId,
        job.entryIds,
        matches,
        tiebreakers,
      );
      computedStandings = computedStandings.concat(standings);
    }

    // Persiste as classificações atualizadas de forma atômica dentro de uma transação
    await this.prisma.$transaction(async (tx) => {
      await tx.phaseStanding.deleteMany({
        where: { phaseId },
      });

      if (computedStandings.length > 0) {
        await tx.phaseStanding.createMany({
          data: computedStandings,
        });
      }
    });
  }
}
