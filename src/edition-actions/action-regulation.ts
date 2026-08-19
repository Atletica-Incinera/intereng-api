import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface ActionScoringRule {
  label: string;
  points: number;
}

export interface ActionSecondaryRule {
  label: string;
  requiresSide: boolean;
  allowedWhenStopped: boolean;
  scorePoints: number;
  fairPlayPoints: number;
}

export type ActionCompletionRule =
  | {
      mode: 'periods';
      allowDraw: boolean;
      overtimePeriods: number;
      overtimeDurationMinutes: number;
    }
  | {
      mode: 'sets';
      setsToWin: number;
      pointsToWinSet: number;
      pointsToWinDecidingSet: number;
      minAdvantage: number;
    }
  | { mode: 'board'; allowDraw: boolean; winPoints: number; drawPoints: number }
  | { mode: 'result'; allowDraw: boolean };

export interface ActionStandingsRule {
  win: number;
  draw: number;
  loss: number;
  tiebreakers: ActionTiebreaker[];
}

export type ActionTiebreaker =
  'confronto-direto' | 'vitorias' | 'saldo' | 'marcados' | 'sofridos' | 'fair-play' | 'sorteio';

export interface ActionKnockoutRule {
  method: 'prorrogacao' | 'penaltis' | 'set-extra' | 'criterio-tecnico' | 'administrativo';
  label: string;
  requiresScore: boolean;
  thirdPlaceMatch: boolean;
}

export type ActionClockMode = 'progressive' | 'countdown' | 'none';

export interface ActionRegulation {
  periodLabel: string;
  periodCount: number;
  periodDurationMinutes: number;
  clockMode: ActionClockMode;
  scoring: ActionScoringRule[];
  secondary: ActionSecondaryRule[];
  completion: ActionCompletionRule;
  standings: ActionStandingsRule;
  knockout: ActionKnockoutRule;
}

const COLLECTIVE_STANDINGS: ActionStandingsRule = {
  win: 3,
  draw: 1,
  loss: 0,
  tiebreakers: ['confronto-direto', 'vitorias', 'saldo', 'marcados', 'fair-play', 'sorteio'],
};

const DEFAULTS: Record<string, ActionRegulation> = {
  Futsal: regulation(
    'Tempo',
    2,
    [scoring('Gol', 1)],
    [secondary('Falta'), secondary('Cartão', { fairPlayPoints: 1 })],
    { mode: 'periods', allowDraw: true, overtimePeriods: 0, overtimeDurationMinutes: 0 },
    COLLECTIVE_STANDINGS,
    knockout('penaltis', 'Pênaltis'),
    { clockMode: 'countdown', periodDurationMinutes: 20 },
  ),
  Handebol: regulation(
    'Tempo',
    2,
    [scoring('Gol', 1)],
    [secondary('Falta'), secondary('2 minutos', { fairPlayPoints: 1 })],
    { mode: 'periods', allowDraw: true, overtimePeriods: 0, overtimeDurationMinutes: 0 },
    COLLECTIVE_STANDINGS,
    knockout('penaltis', 'Pênaltis'),
    { clockMode: 'countdown', periodDurationMinutes: 30 },
  ),
  Basquete: regulation(
    'Tempo',
    2,
    [scoring('Lance livre', 1), scoring('Cesta de 2', 2), scoring('Cesta de 3', 3)],
    [secondary('Falta', { fairPlayPoints: 1 }), secondary('Tempo técnico', { requiresSide: true })],
    { mode: 'periods', allowDraw: false, overtimePeriods: 1, overtimeDurationMinutes: 5 },
    {
      win: 2,
      draw: 0,
      loss: 1,
      tiebreakers: ['confronto-direto', 'saldo', 'marcados', 'fair-play', 'sorteio'],
    },
    knockout('prorrogacao', 'Prorrogação'),
    { clockMode: 'countdown', periodDurationMinutes: 10 },
  ),
  Vôlei: regulation(
    'Set',
    5,
    [scoring('Ponto', 1)],
    [secondary('Falta'), secondary('Tempo técnico')],
    {
      mode: 'sets',
      setsToWin: 3,
      pointsToWinSet: 25,
      pointsToWinDecidingSet: 15,
      minAdvantage: 2,
    },
    {
      win: 3,
      draw: 0,
      loss: 0,
      tiebreakers: ['confronto-direto', 'vitorias', 'saldo', 'marcados', 'sorteio'],
    },
    knockout('set-extra', 'Set extra'),
    { clockMode: 'none', periodDurationMinutes: 0 },
  ),
  Xadrez: regulation(
    'Rodada',
    7,
    [scoring('Ponto', 1)],
    [secondary('Advertência', { fairPlayPoints: 1 })],
    { mode: 'board', allowDraw: true, winPoints: 1, drawPoints: 0.5 },
    {
      win: 1,
      draw: 0.5,
      loss: 0,
      tiebreakers: ['confronto-direto', 'vitorias', 'sorteio'],
    },
    knockout('criterio-tecnico', 'Critério técnico do regulamento', false, false),
    { clockMode: 'none', periodDurationMinutes: 0 },
  ),
  Natação: regulation(
    'Prova',
    1,
    [scoring('Resultado', 1)],
    [secondary('Largada', { requiresSide: false }), secondary('Ocorrência')],
    { mode: 'result', allowDraw: false },
    { win: 3, draw: 1, loss: 0, tiebreakers: ['vitorias', 'marcados', 'sorteio'] },
    knockout('criterio-tecnico', 'Critério técnico do regulamento', false, false),
    { clockMode: 'none', periodDurationMinutes: 0 },
  ),
};

const GENERIC = regulation(
  'Tempo',
  2,
  [scoring('Ponto', 1)],
  [secondary('Falta'), secondary('Ocorrência')],
  { mode: 'periods', allowDraw: true, overtimePeriods: 0, overtimeDurationMinutes: 0 },
  COLLECTIVE_STANDINGS,
  knockout('criterio-tecnico', 'Critério técnico do regulamento', false, false),
  { clockMode: 'countdown', periodDurationMinutes: 20 },
);

export function resolveActionRegulation(
  discipline: string,
  config: Prisma.JsonValue | null,
): ActionRegulation {
  const preset = DEFAULTS[discipline] ?? GENERIC;
  const root = record(config);
  const rules = record(root?.rules) ?? root;
  if (!rules) return cloneRegulation(preset);

  const periodLabel = stringValue(rules.periodLabel) ?? preset.periodLabel;
  const periodCount = positiveInteger(rules.periodCount) ?? preset.periodCount;
  const clockMode = parseClockMode(rules.clockMode, preset.clockMode);
  const periodDurationMinutes =
    nonNegativeInteger(rules.periodDurationMinutes) ?? preset.periodDurationMinutes;
  const scoringRules = parseScoring(rules.scoring);
  const legacyScoring = stringValue(rules.scoringEvent);
  const scoringActions = scoringRules.length
    ? scoringRules
    : legacyScoring
      ? preset.scoring[0]?.label === legacyScoring
        ? preset.scoring
        : [scoring(legacyScoring, 1)]
      : preset.scoring;
  const secondaryRules = parseSecondary(rules.secondary);
  const legacySecondary = Array.isArray(rules.secondaryEvents)
    ? rules.secondaryEvents.filter(
        (item): item is string => typeof item === 'string' && !!item.trim(),
      )
    : [];
  const secondaryActions = secondaryRules.length
    ? secondaryRules
    : legacySecondary.length
      ? legacySecondary.map(
          (label) =>
            preset.secondary.find(
              (item) => normalizedLabel(item.label) === normalizedLabel(label),
            ) ?? secondary(label),
        )
      : preset.secondary;

  return {
    periodLabel,
    periodCount,
    periodDurationMinutes,
    clockMode,
    scoring: scoringActions.map((item) => ({ ...item })),
    secondary: secondaryActions.map((item) => ({ ...item })),
    completion: parseCompletion(rules.completion, preset.completion),
    standings: parseStandings(rules.standings, preset.standings),
    knockout: parseKnockout(rules.knockout, preset.knockout),
  };
}

export function normalizedLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

export function regulationPeriodCount(regulationValue: ActionRegulation): number {
  return regulationValue.completion.mode === 'sets'
    ? regulationValue.completion.setsToWin * 2 - 1
    : regulationValue.periodCount;
}

export function setWinner(
  regulationValue: ActionRegulation,
  period: number,
  scoreA: number,
  scoreB: number,
): 'home' | 'away' | null {
  if (regulationValue.completion.mode !== 'sets') return null;
  const completion = regulationValue.completion;
  const decidingSet = completion.setsToWin * 2 - 1;
  const target =
    period >= decidingSet ? completion.pointsToWinDecidingSet : completion.pointsToWinSet;
  if (Math.max(scoreA, scoreB) < target || Math.abs(scoreA - scoreB) < completion.minAdvantage) {
    return null;
  }
  return scoreA > scoreB ? 'home' : 'away';
}

function regulation(
  periodLabel: string,
  periodCount: number,
  scoringRules: ActionScoringRule[],
  secondaryRules: ActionSecondaryRule[],
  completion: ActionCompletionRule,
  standings: ActionStandingsRule,
  knockoutRule: ActionKnockoutRule,
  timing: { clockMode: ActionClockMode; periodDurationMinutes: number },
): ActionRegulation {
  return {
    periodLabel,
    periodCount,
    clockMode: timing.clockMode,
    periodDurationMinutes: timing.periodDurationMinutes,
    scoring: scoringRules,
    secondary: secondaryRules,
    completion,
    standings,
    knockout: knockoutRule,
  };
}

function scoring(label: string, points: number): ActionScoringRule {
  return { label, points };
}

function secondary(
  label: string,
  options: Partial<Omit<ActionSecondaryRule, 'label'>> = {},
): ActionSecondaryRule {
  return {
    label,
    requiresSide: true,
    allowedWhenStopped: true,
    scorePoints: 0,
    fairPlayPoints: 0,
    ...options,
  };
}

function knockout(
  method: ActionKnockoutRule['method'],
  label: string,
  requiresScore = true,
  thirdPlaceMatch = true,
): ActionKnockoutRule {
  return { method, label, requiresScore, thirdPlaceMatch };
}

function parseScoring(value: unknown): ActionScoringRule[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const entry = record(item);
    const label = stringValue(entry?.label);
    const points = integer(entry?.points);
    if (!label || points === undefined || points <= 0) {
      throw new ConflictException(`A ação de pontuação ${index + 1} do regulamento é inválida.`);
    }
    return { label, points };
  });
}

function parseSecondary(value: unknown): ActionSecondaryRule[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const entry = record(item);
    const label = stringValue(entry?.label);
    if (!label) {
      throw new ConflictException(`O evento secundário ${index + 1} do regulamento é inválido.`);
    }
    return {
      label,
      requiresSide: booleanValue(entry?.requiresSide) ?? true,
      allowedWhenStopped: booleanValue(entry?.allowedWhenStopped) ?? true,
      scorePoints: nonNegativeInteger(entry?.scorePoints) ?? 0,
      fairPlayPoints: nonNegativeInteger(entry?.fairPlayPoints) ?? 0,
    };
  });
}

function parseCompletion(value: unknown, fallback: ActionCompletionRule): ActionCompletionRule {
  const completion = record(value);
  if (!completion) return { ...fallback };
  if (completion.mode === 'sets') {
    return {
      mode: 'sets',
      setsToWin: requiredPositiveInteger(completion.setsToWin, 'sets para vencer'),
      pointsToWinSet: requiredPositiveInteger(completion.pointsToWinSet, 'pontos por set'),
      pointsToWinDecidingSet: requiredPositiveInteger(
        completion.pointsToWinDecidingSet,
        'pontos do set decisivo',
      ),
      minAdvantage: requiredPositiveInteger(completion.minAdvantage, 'vantagem mínima'),
    };
  }
  if (completion.mode === 'periods') {
    return {
      mode: 'periods',
      allowDraw: booleanValue(completion.allowDraw) ?? true,
      overtimePeriods: nonNegativeInteger(completion.overtimePeriods) ?? 0,
      overtimeDurationMinutes: nonNegativeInteger(completion.overtimeDurationMinutes) ?? 0,
    };
  }
  if (completion.mode === 'board') {
    return {
      mode: 'board',
      allowDraw: booleanValue(completion.allowDraw) ?? true,
      winPoints: finiteNumber(completion.winPoints) ?? 1,
      drawPoints: finiteNumber(completion.drawPoints) ?? 0.5,
    };
  }
  if (completion.mode === 'result') {
    return { mode: 'result', allowDraw: booleanValue(completion.allowDraw) ?? false };
  }
  throw new ConflictException('O modo de encerramento configurado no regulamento é inválido.');
}

function parseStandings(value: unknown, fallback: ActionStandingsRule): ActionStandingsRule {
  const standings = record(value);
  if (!standings) return { ...fallback, tiebreakers: [...fallback.tiebreakers] };
  const rawTiebreakers = standings.tiebreakers;
  const accepted = new Set<ActionTiebreaker>([
    'confronto-direto',
    'vitorias',
    'saldo',
    'marcados',
    'sofridos',
    'fair-play',
    'sorteio',
  ]);
  if (
    !Array.isArray(rawTiebreakers) ||
    !rawTiebreakers.length ||
    rawTiebreakers.some(
      (item) => typeof item !== 'string' || !accepted.has(item as ActionTiebreaker),
    )
  ) {
    throw new ConflictException('Os critérios de desempate configurados são inválidos.');
  }
  return {
    win: requiredFiniteNumber(standings.win, 'a pontuação por vitória'),
    draw: requiredFiniteNumber(standings.draw, 'a pontuação por empate'),
    loss: requiredFiniteNumber(standings.loss, 'a pontuação por derrota'),
    tiebreakers: rawTiebreakers as ActionTiebreaker[],
  };
}

function parseKnockout(value: unknown, fallback: ActionKnockoutRule): ActionKnockoutRule {
  const knockoutValue = record(value);
  if (!knockoutValue) return { ...fallback };
  const methods = new Set<ActionKnockoutRule['method']>([
    'prorrogacao',
    'penaltis',
    'set-extra',
    'criterio-tecnico',
    'administrativo',
  ]);
  const method = knockoutValue.method;
  const label = stringValue(knockoutValue.label);
  if (
    typeof method !== 'string' ||
    !methods.has(method as ActionKnockoutRule['method']) ||
    !label
  ) {
    throw new ConflictException('A regra de desempate eliminatório é inválida.');
  }
  return {
    method: method as ActionKnockoutRule['method'],
    label,
    requiresScore: booleanValue(knockoutValue.requiresScore) ?? fallback.requiresScore,
    thirdPlaceMatch: booleanValue(knockoutValue.thirdPlaceMatch) ?? fallback.thirdPlaceMatch,
  };
}

function cloneRegulation(value: ActionRegulation): ActionRegulation {
  return {
    ...value,
    scoring: value.scoring.map((item) => ({ ...item })),
    secondary: value.secondary.map((item) => ({ ...item })),
    completion: { ...value.completion },
    standings: { ...value.standings, tiebreakers: [...value.standings.tiebreakers] },
    knockout: { ...value.knockout },
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseClockMode(value: unknown, fallback: ActionClockMode): ActionClockMode {
  if (value === undefined) return fallback;
  if (value === 'countup') return 'progressive';
  if (value === 'progressive' || value === 'countdown' || value === 'none') return value;
  throw new ConflictException('O modo do cronômetro configurado no regulamento é inválido.');
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function integer(value: unknown): number | undefined {
  const result = finiteNumber(value);
  return result !== undefined && Number.isInteger(result) ? result : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const result = integer(value);
  return result !== undefined && result > 0 ? result : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const result = integer(value);
  return result !== undefined && result >= 0 ? result : undefined;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  const parsed = positiveInteger(value);
  if (parsed === undefined) {
    throw new ConflictException(`A configuração de ${label} deve ser um inteiro positivo.`);
  }
  return parsed;
}

function requiredFiniteNumber(value: unknown, label: string): number {
  const parsed = finiteNumber(value);
  if (parsed === undefined) {
    throw new ConflictException(`A configuração de ${label} deve ser numérica.`);
  }
  return parsed;
}
