import { TiebreakerStrategy, TiebreakerContext } from '../interfaces/tiebreaker-strategy.interface';

/**
 * Estratégia de desempate baseada no confronto direto (Head-to-Head).
 * Esta estratégia monta uma "mini-tabela" considerando apenas as partidas disputadas
 * entre as equipes atualmente empatadas no subconjunto (context.teamSubset).
 * As equipes são ordenadas com base nos pontos obtidos nessas partidas específicas.
 */
export class HeadToHeadStrategy implements TiebreakerStrategy {
  /**
   * Compara duas equipes pelo critério de confronto direto.
   * Avalia os resultados apenas das partidas em que ambos os times participantes pertencem ao subconjunto de empate.
   * Retorna um número negativo se 'a' obteve mais pontos que 'b' no confronto direto direto/mini-tabela,
   * positivo se 'b' obteve mais pontos, ou 0 se persistir o empate.
   */
  compare(a: string, b: string, context: TiebreakerContext): number {
    const { matches, teamSubset } = context;
    const h2hStats = new Map<string, number>();

    // Inicializa os pontos de desempate para todas as equipes do subconjunto
    for (const id of teamSubset) {
      h2hStats.set(id, 0);
    }

    // Calcula os pontos das partidas disputadas apenas entre as equipes do subconjunto
    for (const match of matches) {
      const { entryAId, entryBId, winnerEntryId } = match;
      if (!entryAId || !entryBId) continue;

      if (teamSubset.has(entryAId) && teamSubset.has(entryBId)) {
        if (winnerEntryId === entryAId) {
          h2hStats.set(entryAId, (h2hStats.get(entryAId) || 0) + 3);
        } else if (winnerEntryId === entryBId) {
          h2hStats.set(entryBId, (h2hStats.get(entryBId) || 0) + 3);
        } else {
          h2hStats.set(entryAId, (h2hStats.get(entryAId) || 0) + 1);
          h2hStats.set(entryBId, (h2hStats.get(entryBId) || 0) + 1);
        }
      }
    }

    const ptsA = h2hStats.get(a) || 0;
    const ptsB = h2hStats.get(b) || 0;
    return ptsB - ptsA;
  }
}
