import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
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
   * @deprecated MOTOR LEGADO EM QUARENTENA — NÃO CHAME ESTE MÉTODO EM CÓDIGO DE PRODUÇÃO.
   *
   * A fonte de verdade de `phase_standings` é `EditionActionRecalculationService.recomputeTournament`
   * (src/edition-actions/edition-action-recalculation.service.ts), acionada apenas pelos handlers de
   * ação dentro da transação Serializable com advisory lock por edição.
   *
   * Este método diverge do motor canônico em vários eixos e por isso não pode voltar a ser ligado:
   * - pontuação 3/1/0 fixa (src/standings/standings-calculator.ts) em vez do regulamento por
   *   modalidade (Basquete 2/0/1, vôlei 3/0/0, xadrez 1/0.5/0 — src/edition-actions/action-regulation.ts);
   * - ranks empatados (1,1,3) e possivelmente `null`, enquanto `progressKnockout` exige ranks
   *   sequenciais únicos para montar o mata-mata;
   * - lê e escreve fora do envelope transacional do pipeline de ações (sem lock, sem retry),
   *   o que produz lost update quando concorre com uma ação da mesma edição;
   * - recalcula uma única fase, enquanto o motor canônico recalcula o torneio inteiro.
   *
   * Sobrevive apenas para src/standings/standings.service.spec.ts e test/standings.e2e-spec.ts.
   * Remoção agendada para a fase seguinte do cutover, junto com `StandingsCalculator`,
   * `src/standings/strategies/` e `src/standings/interfaces/tiebreaker-strategy.interface.ts`.
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
