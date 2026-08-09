import { TiebreakerStrategy, TiebreakerContext } from '../interfaces/tiebreaker-strategy.interface';

/**
 * Estratégia de desempate baseada no saldo de gols (diferença entre gols marcados e sofridos).
 * Ordena as equipes de forma decrescente: aquela com maior saldo de gols fica melhor classificada.
 */
export class GoalDiffStrategy implements TiebreakerStrategy {
  /**
   * Compara duas equipes pelo saldo de gols obtido.
   * Retorna um número negativo se 'a' tem saldo maior que 'b', positivo se 'b' tem saldo maior, ou 0 se empatarem.
   */
  compare(a: string, b: string, context: TiebreakerContext): number {
    const statsA = context.globalStats.get(a)!;
    const statsB = context.globalStats.get(b)!;
    const diffA = statsA.scoreFor - statsA.scoreAgainst;
    const diffB = statsB.scoreFor - statsB.scoreAgainst;
    return diffB - diffA;
  }
}
