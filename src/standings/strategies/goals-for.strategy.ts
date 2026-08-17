import { TiebreakerStrategy, TiebreakerContext } from '../interfaces/tiebreaker-strategy.interface';

/**
 * Estratégia de desempate baseada na quantidade total de gols marcados (gols pró).
 * Ordena as equipes de forma decrescente: aquela com maior número de gols pró fica melhor classificada.
 */
export class GoalsForStrategy implements TiebreakerStrategy {
  /**
   * Compara duas equipes pelos gols marcados.
   * Retorna um número negativo se 'a' tem mais gols pró que 'b', positivo se 'b' tem mais gols pró, ou 0 se empatarem.
   */
  compare(a: string, b: string, context: TiebreakerContext): number {
    const statsA = context.globalStats.get(a)!;
    const statsB = context.globalStats.get(b)!;
    return statsB.scoreFor - statsA.scoreFor;
  }
}
