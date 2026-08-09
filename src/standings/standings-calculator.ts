import { Match, Prisma } from '@prisma/client';
import { TeamStats, TiebreakerContext } from './interfaces/tiebreaker-strategy.interface';
import { TIEBREAKER_STRATEGIES } from './strategies';

/**
 * Classe utilitária dedicada a calcular as estatísticas e posições (rankings)
 * das equipes de forma determinística, aplicando os critérios de desempate configurados.
 */
export class StandingsCalculator {
  /**
   * Calcula a classificação para um subconjunto de inscrições e partidas,
   * retornando os objetos no formato aceito para persistência no banco de dados.
   *
   * @param phaseId O ID da fase que está sendo calculada.
   * @param entryIds IDs das inscrições participantes.
   * @param matches Lista de partidas finalizadas ou com W.O. válidas para o cálculo.
   * @param tiebreakers Lista ordenada de critérios de desempate a serem aplicados.
   * @returns Lista de classificações prontas para inserção no banco de dados.
   */
  public static computeStandingsForSubset(
    phaseId: string,
    entryIds: string[],
    matches: Match[],
    tiebreakers: string[],
  ): Prisma.PhaseStandingUncheckedCreateInput[] {
    const statsMap = this.calculateBasicStats(entryIds, matches);
    const sortedEntryIds = this.sortTeamsRecursive(entryIds, tiebreakers, 0, statsMap, matches);
    const ranks = this.assignRanks(sortedEntryIds, tiebreakers, statsMap, matches);

    return entryIds.map((entryId) => {
      const stats = statsMap.get(entryId)!;
      return {
        phaseId,
        entryId,
        played: stats.played,
        won: stats.won,
        drawn: stats.drawn,
        lost: stats.lost,
        scoreFor: stats.scoreFor,
        scoreAgainst: stats.scoreAgainst,
        points: stats.points,
        rank: ranks.get(entryId) || null,
      };
    });
  }

  /**
   * Acumula as estatísticas básicas (vitórias, empates, derrotas, gols pró, gols contra e pontos)
   * de cada inscrição participante com base nas partidas informadas.
   *
   * @param entryIds IDs das inscrições participantes.
   * @param matches Histórico de partidas.
   * @returns Um mapa contendo as estatísticas de cada ID de inscrição.
   */
  private static calculateBasicStats(entryIds: string[], matches: Match[]): Map<string, TeamStats> {
    const statsMap = new Map<string, TeamStats>();

    for (const entryId of entryIds) {
      statsMap.set(entryId, {
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        points: 0,
      });
    }

    for (const match of matches) {
      const { entryAId, entryBId, scoreA, scoreB, winnerEntryId } = match;
      if (!entryAId || !entryBId) continue;

      const statsA = statsMap.get(entryAId);
      const statsB = statsMap.get(entryBId);

      if (statsA && statsB) {
        statsA.played += 1;
        statsB.played += 1;

        statsA.scoreFor += scoreA;
        statsA.scoreAgainst += scoreB;

        statsB.scoreFor += scoreB;
        statsB.scoreAgainst += scoreA;

        if (winnerEntryId === entryAId) {
          statsA.won += 1;
          statsA.points += 3;
          statsB.lost += 1;
        } else if (winnerEntryId === entryBId) {
          statsB.won += 1;
          statsB.points += 3;
          statsA.lost += 1;
        } else {
          statsA.drawn += 1;
          statsA.points += 1;
          statsB.drawn += 1;
          statsB.points += 1;
        }
      }
    }

    return statsMap;
  }

  /**
   * Ordena recursivamente um subconjunto de equipes com base em uma cadeia de critérios de desempate.
   *
   * O algoritmo funciona da seguinte forma:
   * 1. Se houver 1 ou nenhuma equipe no subconjunto, ele já está ordenado.
   * 2. Se todos os critérios de desempate configurados tiverem sido avaliados e ainda houver empates,
   *    utiliza-se um critério de fallback determinístico (ordenação alfabética por ID da inscrição/time).
   * 3. Caso contrário, obtém-se o critério de desempate atual (ex: 'points', 'goalDiff', 'headToHead')
   *    e aplica-se a estratégia correspondente para ordenar o subconjunto atual.
   * 4. As equipes ordenadas são então agrupadas em subconjuntos menores de equipes que continuam empatadas
   *    sob o critério atual.
   * 5. Para cada grupo de equipes empatadas:
   *    - Se o grupo for menor que o subconjunto original (houve algum desempate), reinicia-se a cadeia
   *      de critérios (tiebreakerIndex = 0) para avaliar apenas as equipes desse grupo. Isso garante que
   *      critérios como 'headToHead' (confronto direto) sejam calculados como uma mini-tabela considerando
   *      somente as equipes empatadas naquele nível.
   *    - Se o grupo tiver o mesmo tamanho do subconjunto original (nenhum time desempatou sob o critério atual),
   *      avançamos para o próximo critério de desempate na cadeia (tiebreakerIndex + 1).
   * 6. Os resultados ordenados dos subgrupos são concatenados para formar a lista final ordenada.
   *
   * @param teamIds IDs das inscrições/times a serem ordenados.
   * @param tiebreakers Lista ordenada de chaves de critérios de desempate (ex: ['points', 'headToHead', 'goalDiff']).
   * @param tiebreakerIndex Índice do critério de desempate atual na cadeia.
   * @param globalStats Estatísticas acumuladas de todos os times da fase (usado para critérios globais).
   * @param matches Histórico de partidas finalizadas ou com W.O. na fase/grupo.
   * @returns Lista ordenada de IDs de inscrições.
   */
  private static sortTeamsRecursive(
    teamIds: string[],
    tiebreakers: string[],
    tiebreakerIndex: number,
    globalStats: Map<string, TeamStats>,
    matches: Match[],
  ): string[] {
    if (teamIds.length <= 1) {
      return teamIds;
    }

    if (tiebreakerIndex >= tiebreakers.length) {
      // Fallback determinístico caso todos os tiebreakers empatem (ordenação lexicográfica do ID)
      return [...teamIds].sort((a, b) => a.localeCompare(b));
    }

    const currentTiebreaker = tiebreakers[tiebreakerIndex];
    const strategy = TIEBREAKER_STRATEGIES[currentTiebreaker];
    const teamSubset = new Set(teamIds);
    const context: TiebreakerContext = { globalStats, matches, teamSubset };

    const sorted = [...teamIds].sort((a, b) => {
      if (strategy) {
        return strategy.compare(a, b, context);
      }
      return 0;
    });

    // Agrupa as equipes que continuam empatadas no critério atual
    const groups: string[][] = [];
    let currentGroup: string[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const team = sorted[i];
      const prevTeam = sorted[i - 1];

      const isEqual = strategy ? strategy.compare(team, prevTeam, context) === 0 : true;

      if (isEqual) {
        currentGroup.push(team);
      } else {
        groups.push(currentGroup);
        currentGroup = [team];
      }
    }
    groups.push(currentGroup);

    const resolved: string[] = [];
    for (const g of groups) {
      const nextIndex = g.length < teamIds.length ? 0 : tiebreakerIndex + 1;
      resolved.push(...this.sortTeamsRecursive(g, tiebreakers, nextIndex, globalStats, matches));
    }
    return resolved;
  }

  /**
   * Atribui classificações (ranks) ordinais à lista de equipes previamente ordenadas.
   *
   * O algoritmo atribui posições consecutivas (1, 2, 3, etc.) às equipes, mas respeita empates totais:
   * 1. A primeira equipe na lista ordenada recebe a classificação 1.
   * 2. Para cada equipe subsequente, compara-se com a equipe imediatamente anterior na lista.
   * 3. A comparação avalia se as duas equipes são idênticas em todos os critérios de desempate configurados.
   * 4. Se forem totalmente idênticas (empatadas em todos os critérios de desempate configurados),
   *    a equipe atual recebe a mesma classificação (rank) da equipe anterior.
   * 5. Se houver qualquer diferença em algum critério de desempate, a equipe atual recebe como classificação
   *    a sua posição física na lista (índice 1-based, ex: se for a terceira equipe da lista, recebe rank 3).
   *
   * @param sortedEntryIds Lista ordenada de IDs de inscrições.
   * @param tiebreakers Lista ordenada de chaves de critérios de desempate.
   * @param globalStats Estatísticas acumuladas de todos os times da fase.
   * @param matches Histórico de partidas finalizadas ou com W.O. na fase/grupo.
   * @returns Um Map associando o ID da inscrição ao seu rank ordinal correspondente.
   */
  private static assignRanks(
    sortedEntryIds: string[],
    tiebreakers: string[],
    globalStats: Map<string, TeamStats>,
    matches: Match[],
  ): Map<string, number> {
    const ranks = new Map<string, number>();
    if (sortedEntryIds.length === 0) return ranks;

    ranks.set(sortedEntryIds[0], 1);

    for (let i = 1; i < sortedEntryIds.length; i++) {
      const currentId = sortedEntryIds[i];
      const prevId = sortedEntryIds[i - 1];

      let isFullyEqual = true;
      const teamSubset = new Set([currentId, prevId]);
      const context: TiebreakerContext = { globalStats, matches, teamSubset };

      for (const tb of tiebreakers) {
        const strategy = TIEBREAKER_STRATEGIES[tb];
        if (strategy) {
          if (strategy.compare(currentId, prevId, context) !== 0) {
            isFullyEqual = false;
            break;
          }
        }
      }

      if (isFullyEqual) {
        ranks.set(currentId, ranks.get(prevId)!);
      } else {
        ranks.set(currentId, i + 1);
      }
    }

    return ranks;
  }
}
