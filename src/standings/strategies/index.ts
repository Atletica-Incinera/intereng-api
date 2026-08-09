import { TiebreakerStrategy } from '../interfaces/tiebreaker-strategy.interface';
import { PointsStrategy } from './points.strategy';
import { GoalDiffStrategy } from './goal-diff.strategy';
import { GoalsForStrategy } from './goals-for.strategy';
import { HeadToHeadStrategy } from './head-to-head.strategy';

export * from './points.strategy';
export * from './goal-diff.strategy';
export * from './goals-for.strategy';
export * from './head-to-head.strategy';

/**
 * Registro de estratégias de desempate disponíveis no sistema.
 * Mapeia o nome do critério para a sua respectiva implementação da estratégia.
 */
export const TIEBREAKER_STRATEGIES: Record<string, TiebreakerStrategy> = {
  points: new PointsStrategy(),
  goalDiff: new GoalDiffStrategy(),
  goalsFor: new GoalsForStrategy(),
  scoreFor: new GoalsForStrategy(), // Suporta o alias scoreFor do PRD
  headToHead: new HeadToHeadStrategy(),
};
