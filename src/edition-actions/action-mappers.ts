import {
  EditionStatus,
  EventType,
  MatchEventSide,
  MatchStatus,
  OverallAwardOrigin,
  OverallPosition,
  PhaseType,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

export const MATCH_STATUS_VALUES = [
  'Agendada',
  'Ao vivo',
  'Encerrada',
  'Adiada',
  'Cancelada',
  'W.O.',
] as const;
export const TOURNAMENT_STATUS_VALUES = [
  'Rascunho',
  'Publicado',
  'Em andamento',
  'Encerrado',
  'Arquivado',
] as const;
export const EDITION_STATUS_VALUES = [
  'Planejamento',
  'Em andamento',
  'Finalizada',
  'Arquivada',
] as const;
export const PHASE_FORMAT_VALUES = ['Grupos', 'Mata-mata', 'Liga'] as const;
export const OVERALL_POSITION_VALUES = ['campeao', 'vice', 'terceiro', 'participacao'] as const;

export function mapMatchStatus(value: (typeof MATCH_STATUS_VALUES)[number]): MatchStatus {
  const map: Record<(typeof MATCH_STATUS_VALUES)[number], MatchStatus> = {
    Agendada: MatchStatus.SCHEDULED,
    'Ao vivo': MatchStatus.LIVE,
    Encerrada: MatchStatus.FINISHED,
    Adiada: MatchStatus.POSTPONED,
    Cancelada: MatchStatus.CANCELLED,
    'W.O.': MatchStatus.WALKOVER,
  };
  return map[value];
}

export function mapTournamentStatus(
  value: (typeof TOURNAMENT_STATUS_VALUES)[number],
): TournamentStatus {
  const map: Record<(typeof TOURNAMENT_STATUS_VALUES)[number], TournamentStatus> = {
    Rascunho: TournamentStatus.DRAFT,
    Publicado: TournamentStatus.SCHEDULED,
    'Em andamento': TournamentStatus.ONGOING,
    Encerrado: TournamentStatus.FINISHED,
    Arquivado: TournamentStatus.CANCELLED,
  };
  return map[value];
}

export function mapEditionStatus(value: (typeof EDITION_STATUS_VALUES)[number]): EditionStatus {
  const map: Record<(typeof EDITION_STATUS_VALUES)[number], EditionStatus> = {
    Planejamento: EditionStatus.PLANNING,
    'Em andamento': EditionStatus.ONGOING,
    Finalizada: EditionStatus.FINISHED,
    Arquivada: EditionStatus.ARCHIVED,
  };
  return map[value];
}

export function mapPhaseType(value: (typeof PHASE_FORMAT_VALUES)[number]): PhaseType {
  const map: Record<(typeof PHASE_FORMAT_VALUES)[number], PhaseType> = {
    Grupos: PhaseType.GROUP,
    'Mata-mata': PhaseType.KNOCKOUT,
    Liga: PhaseType.LEAGUE,
  };
  return map[value];
}

export function inferTournamentFormat(phases: readonly { format: string }[]): TournamentFormat {
  const hasGroups = phases.some((phase) => phase.format === 'Grupos');
  const hasLeague = phases.some((phase) => phase.format === 'Liga');
  const hasKnockout = phases.some((phase) => phase.format === 'Mata-mata');
  if (hasGroups && hasKnockout) return TournamentFormat.GROUP_KNOCKOUT;
  if (hasLeague && hasKnockout) return TournamentFormat.LEAGUE_KNOCKOUT;
  if (hasLeague) return TournamentFormat.LEAGUE_ONLY;
  return TournamentFormat.SINGLE_ELIMINATION;
}

export function mapOverallPosition(value: string | undefined): OverallPosition | undefined {
  if (value === undefined) return undefined;
  const map: Record<(typeof OVERALL_POSITION_VALUES)[number], OverallPosition> = {
    campeao: OverallPosition.CHAMPION,
    vice: OverallPosition.RUNNER_UP,
    terceiro: OverallPosition.THIRD,
    participacao: OverallPosition.PARTICIPATION,
  };
  if (!OVERALL_POSITION_VALUES.includes(value as (typeof OVERALL_POSITION_VALUES)[number])) {
    throw new BadRequestException('A posição da métrica é inválida.');
  }
  return map[value as (typeof OVERALL_POSITION_VALUES)[number]];
}

export function mapAwardOrigin(value: string | undefined): OverallAwardOrigin {
  if (value === undefined || value === 'manual') return OverallAwardOrigin.MANUAL;
  if (value === 'automatico') return OverallAwardOrigin.AUTOMATIC;
  throw new BadRequestException('A origem da pontuação é inválida.');
}

export function mapEventSide(value: string): MatchEventSide {
  if (value === 'home') return MatchEventSide.HOME;
  if (value === 'away') return MatchEventSide.AWAY;
  if (value === 'neutral') return MatchEventSide.NEUTRAL;
  throw new BadRequestException('O lado do evento é inválido.');
}

export function mapEventType(value: string): EventType {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('gol')) return EventType.GOAL;
  if (normalized.includes('assist')) return EventType.ASSIST;
  if (normalized.includes('amarelo')) return EventType.YELLOW_CARD;
  if (normalized.includes('vermelho')) return EventType.RED_CARD;
  if (normalized.includes('falta')) return EventType.FOUL;
  if (normalized.includes('timeout') || normalized.includes('tempo tecnico')) {
    return EventType.TIMEOUT_CALLED;
  }
  if (normalized.includes('substitu')) return EventType.SUBSTITUTION;
  if (normalized.includes('desclass') || normalized.includes('expuls')) {
    return EventType.DISQUALIFICATION;
  }
  if (normalized.includes('xeque') || normalized.includes('checkmate')) return EventType.CHECKMATE;
  if (normalized.includes('set')) return EventType.SET_WON;
  if (normalized.includes('ponto') || normalized.includes('cesta')) return EventType.POINT;
  return EventType.OTHER;
}
