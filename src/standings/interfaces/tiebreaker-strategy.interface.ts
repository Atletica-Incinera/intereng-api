import { Match } from '@prisma/client';

/**
 * Estatísticas acumuladas de uma equipe/inscrição durante uma fase ou grupo.
 */
export interface TeamStats {
  /** Quantidade de partidas jogadas */
  played: number;
  /** Quantidade de vitórias */
  won: number;
  /** Quantidade de empates */
  drawn: number;
  /** Quantidade de derrotas */
  lost: number;
  /** Pontos marcados a favor (gols/pontos feitos) */
  scoreFor: number;
  /** Pontos sofridos contra (gols/pontos tomados) */
  scoreAgainst: number;
  /** Pontos obtidos na tabela de classificação (ex: 3 por vitória, 1 por empate) */
  points: number;
}

/**
 * Contexto compartilhado para a execução das estratégias de desempate.
 */
export interface TiebreakerContext {
  /** Estatísticas globais acumuladas de todas as equipes no subset sendo ordenado */
  globalStats: Map<string, TeamStats>;
  /** Lista de partidas consideradas para o cálculo (partidas finalizadas ou W.O.) */
  matches: Match[];
  /** O subconjunto de IDs das equipes que estão empatadas no momento do cálculo do confronto direto */
  teamSubset: Set<string>;
}

/**
 * Interface que define o contrato que toda estratégia de desempate deve implementar.
 */
export interface TiebreakerStrategy {
  /**
   * Compara duas equipes com base em um critério específico.
   * Retorna um número negativo se 'a' deve ficar antes de 'b',
   * positivo se 'b' deve ficar antes de 'a', ou 0 se continuarem empatadas.
   *
   * @param a ID da primeira equipe/inscrição
   * @param b ID da segunda equipe/inscrição
   * @param context Contexto com as estatísticas acumuladas e partidas executadas
   */
  compare(a: string, b: string, context: TiebreakerContext): number;
}
