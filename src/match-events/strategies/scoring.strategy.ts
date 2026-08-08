import { MatchEvent, EventType } from '@prisma/client';

/**
 * Interface representing a strategy for calculating score contributions from a match event.
 */
export interface ScoringStrategy {
  /**
   * Calculates the score contribution of a single event for the match.
   *
   * @param event - The match event.
   * @param isEntryA - Whether the event's entryId corresponds to Entry A.
   * @param isEntryB - Whether the event's entryId corresponds to Entry B.
   * @returns An object with points added to scoreA and scoreB.
   */
  calculateScore(
    event: MatchEvent,
    isEntryA: boolean,
    isEntryB: boolean,
  ): { pointsA: number; pointsB: number };
}

/**
 * Scoring strategy for goal-based sports (e.g., Futsal, Handball).
 * Award 1 point for a GOAL event.
 */
export class GoalScoringStrategy implements ScoringStrategy {
  calculateScore(
    event: MatchEvent,
    isEntryA: boolean,
    isEntryB: boolean,
  ): { pointsA: number; pointsB: number } {
    if (event.type === EventType.GOAL) {
      return {
        pointsA: isEntryA ? 1 : 0,
        pointsB: isEntryB ? 1 : 0,
      };
    }
    return { pointsA: 0, pointsB: 0 };
  }
}

/**
 * Scoring strategy for set-based sports (e.g., Volleyball, Table Tennis).
 * Award 1 point (set won) for a SET_WON event.
 */
export class SetScoringStrategy implements ScoringStrategy {
  calculateScore(
    event: MatchEvent,
    isEntryA: boolean,
    isEntryB: boolean,
  ): { pointsA: number; pointsB: number } {
    if (event.type === EventType.SET_WON) {
      return {
        pointsA: isEntryA ? 1 : 0,
        pointsB: isEntryB ? 1 : 0,
      };
    }
    return { pointsA: 0, pointsB: 0 };
  }
}

/**
 * Scoring strategy for basketball.
 * Award points based on metadata or defaults to 1 point.
 */
export class BasketballScoringStrategy implements ScoringStrategy {
  calculateScore(
    event: MatchEvent,
    isEntryA: boolean,
    isEntryB: boolean,
  ): { pointsA: number; pointsB: number } {
    if (event.type === EventType.POINT) {
      const metadata = event.metadata as Record<string, unknown>;
      const points = typeof metadata['points'] === 'number' ? metadata['points'] : 1;
      return {
        pointsA: isEntryA ? points : 0,
        pointsB: isEntryB ? points : 0,
      };
    }
    return { pointsA: 0, pointsB: 0 };
  }
}

/**
 * Scoring strategy for chess.
 * Award 1 point for CHECKMATE or WALKOVER_DECLARED.
 */
export class ChessScoringStrategy implements ScoringStrategy {
  calculateScore(
    event: MatchEvent,
    isEntryA: boolean,
    isEntryB: boolean,
  ): { pointsA: number; pointsB: number } {
    if (event.type === EventType.CHECKMATE || event.type === EventType.WALKOVER_DECLARED) {
      return {
        pointsA: isEntryA ? 1 : 0,
        pointsB: isEntryB ? 1 : 0,
      };
    }
    return { pointsA: 0, pointsB: 0 };
  }
}

/**
 * Default fallback scoring strategy when no specific strategy matches the discipline.
 * Awards 0 points for any event.
 */
export class DefaultScoringStrategy implements ScoringStrategy {
  calculateScore(): { pointsA: number; pointsB: number } {
    return { pointsA: 0, pointsB: 0 };
  }
}

/**
 * Registry mapping discipline slugs to their corresponding scoring strategies.
 * Provides lookup, registration, and deregistration capabilities.
 */
export class ScoringStrategyRegistry {
  private static readonly strategies = new Map<string, ScoringStrategy>([
    ['futsal', new GoalScoringStrategy()],
    ['handebol', new GoalScoringStrategy()],
    ['handball', new GoalScoringStrategy()],
    ['volei', new SetScoringStrategy()],
    ['volleyball', new SetScoringStrategy()],
    ['tenis-de-mesa', new SetScoringStrategy()],
    ['table-tennis', new SetScoringStrategy()],
    ['basquete', new BasketballScoringStrategy()],
    ['basquetebol', new BasketballScoringStrategy()],
    ['basketball', new BasketballScoringStrategy()],
    ['xadrez', new ChessScoringStrategy()],
    ['chess', new ChessScoringStrategy()],
  ]);

  private static readonly defaultStrategy = new DefaultScoringStrategy();

  /**
   * Retrieves the scoring strategy for a given discipline slug.
   * Normalizes the slug before mapping.
   *
   * @param disciplineSlug - The discipline slug string.
   * @returns The registered ScoringStrategy or DefaultScoringStrategy.
   */
  static getStrategy(disciplineSlug: string): ScoringStrategy {
    const normalized = this.normalizeSlug(disciplineSlug);
    return this.strategies.get(normalized) ?? this.defaultStrategy;
  }

  /**
   * Dynamically registers a scoring strategy for a discipline slug.
   *
   * @param disciplineSlug - The discipline slug.
   * @param strategy - The strategy instance.
   */
  static register(disciplineSlug: string, strategy: ScoringStrategy): void {
    const normalized = this.normalizeSlug(disciplineSlug);
    this.strategies.set(normalized, strategy);
  }

  /**
   * Unregisters a scoring strategy.
   *
   * @param disciplineSlug - The discipline slug.
   */
  static unregister(disciplineSlug: string): void {
    const normalized = this.normalizeSlug(disciplineSlug);
    this.strategies.delete(normalized);
  }

  /**
   * Normalizes a discipline slug.
   *
   * @param slug - The raw slug.
   */
  private static normalizeSlug(slug: string): string {
    if (!slug) return '';
    return slug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-');
  }
}
