import { TiebreakerStrategy, TiebreakerContext } from '../interfaces/tiebreaker-strategy.interface';

/**
 * Estratégia de desempate baseada no total de pontos acumulados.
 * Ordena as equipes de forma decrescente: aquela com mais pontos fica melhor classificada.
 */
export class PointsStrategy implements TiebreakerStrategy {
  /**
   * Compara duas equipes pelo total de pontos obtidos.
   * Retorna um número negativo se 'a' tem mais pontos que 'b', positivo se 'b' tem mais que 'a', ou 0 se empatarem.
   */
  compare(a: string, b: string, context: TiebreakerContext): number {
    const statsA = context.globalStats.get(a)!;
    const statsB = context.globalStats.get(b)!;
    return statsB.points - statsA.points;
  }
}
