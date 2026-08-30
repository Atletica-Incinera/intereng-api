export type SnapshotTone = 'blue' | 'pink' | 'orange';

export interface CompetitionSnapshotDto {
  id: string;
  name: string;
  slug: string;
  active: boolean;
}

export interface EditionSnapshotDto {
  id: string;
  name: string;
  year: number;
  start: string;
  end: string;
  status: 'Planejamento' | 'Em andamento' | 'Finalizada' | 'Arquivada';
  active: boolean;
  competitionId: string;
}

export interface TeamSnapshotDto {
  name: string;
  initials?: string;
  responsible?: string;
  logo?: string;
  archived: boolean;
  created: boolean;
  tone?: SnapshotTone;
}

export interface AthleteSnapshotDto {
  name: string;
  teamId?: string;
  modalities: string[];
  created?: boolean;
  removed: boolean;
}

export interface DisciplineRuleSnapshotDto {
  periodLabel: string;
  periodCount: number;
  periodDurationMinutes: number;
  clockMode: 'progressive' | 'countdown' | 'none';
  scoringEvent: string;
  secondaryEvents: [string, string];
  scoring?: Array<Record<string, unknown>>;
  secondary?: Array<Record<string, unknown>>;
  completion?: Record<string, unknown>;
  roster?: Record<string, unknown>;
  standings?: Record<string, unknown>;
  knockout?: Record<string, unknown>;
  walkover?: Record<string, unknown>;
}

export interface DisciplineSnapshotDto {
  config?: string;
  rules?: DisciplineRuleSnapshotDto;
  enabled: boolean;
  created: boolean;
  name: string;
  mode: 'Coletiva' | 'Individual';
  tournaments: number;
  tone?: SnapshotTone;
  startedAt?: string;
}

export interface PhaseStandingSnapshotDto {
  entryId: string;
  entryName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
  /** Acumulado de fair play; o desempate `fair-play` ordena por ele. */
  disciplinary: number;
  rank: number | null;
}

export interface TournamentPhaseSnapshotDto {
  id: string;
  name: string;
  format: 'Grupos' | 'Mata-mata' | 'Liga';
  groups: string[];
  qualifiers: number;
  standings: PhaseStandingSnapshotDto[];
}

export interface TournamentAdvancementSnapshotDto {
  perGroup: number;
  bestThirds: number;
  crossing: 'padrao' | 'sequencial';
  thirdPlaceMatch: boolean;
}

export interface TournamentSnapshotDto {
  status: 'Rascunho' | 'Publicado' | 'Em andamento' | 'Encerrado' | 'Arquivado';
  participants: string[];
  seeds: Record<string, number>;
  phases: TournamentPhaseSnapshotDto[];
  assignments: Record<string, string>;
  generated: boolean;
  editionId: string;
  created: boolean;
  name: string;
  discipline: string;
  format: string;
  tone?: SnapshotTone;
  advancement?: TournamentAdvancementSnapshotDto;
  byes?: Record<string, string>;
}

export interface MatchScoreSnapshotDto {
  scoreA: number;
  scoreB: number;
  periodScoreA: number;
  periodScoreB: number;
  currentPeriod: number;
}

export interface MatchEventSnapshotDto {
  id: string;
  at: string;
  elapsedSeconds: number;
  period?: number;
  periodElapsedSeconds?: number;
  type: string;
  detail: string;
  side: 'home' | 'away' | 'neutral';
  /** Autor do lance, quando a mesa informou. Sustenta a artilharia. */
  athleteId?: string;
  scoreA: number;
  scoreB: number;
  previousScoreA?: number;
  previousScoreB?: number;
  points?: number;
  previous?: MatchScoreSnapshotDto;
}

export interface MatchTiebreakSnapshotDto {
  method: 'prorrogacao' | 'penaltis' | 'set-extra' | 'criterio-tecnico' | 'administrativo';
  label: string;
  scoreA: number;
  scoreB: number;
  winner: string;
  reason: string;
  decidedBy: string;
  at: string;
}

export interface MatchCorrectionSnapshotDto {
  id: string;
  at: string;
  actor: string;
  reason: string;
  before: string;
  after: string;
}

export interface MatchSnapshotDto {
  date?: string;
  time?: string;
  venue?: string;
  status: 'Agendada' | 'Ao vivo' | 'Encerrada' | 'Adiada' | 'Cancelada' | 'W.O.';
  reason?: string;
  scoreA: number;
  scoreB: number;
  created: boolean;
  editionId: string;
  discipline: string;
  entryA?: string;
  entryB?: string;
  logoA?: string;
  logoB?: string;
  phase: string;
  tournamentId: string;
  rules?: DisciplineRuleSnapshotDto;
  currentPeriod: number;
  clockSeconds: number;
  runningSince?: string;
  paused: boolean;
  events: MatchEventSnapshotDto[];
  operatorId?: string;
  operatorName?: string;
  operatorHeartbeat?: string;
  periodScoreA: number;
  periodScoreB: number;
  periodResults: Array<{ period: number; scoreA: number; scoreB: number }>;
  startedAt?: string;
  startedBy?: string;
  startNote?: string;
  tiebreak?: MatchTiebreakSnapshotDto;
  corrections: MatchCorrectionSnapshotDto[];
  walkoverWinner?: string;
}

export type OverallPositionSnapshot = 'campeao' | 'vice' | 'terceiro' | 'participacao';

export interface OverallMetricSnapshotDto {
  id: string;
  name: string;
  defaultPoints: number;
  position?: OverallPositionSnapshot;
}

export interface OverallAwardSnapshotDto {
  id: string;
  editionId: string;
  teamId: string;
  discipline: string;
  metricId: string;
  points: number;
  note?: string;
  createdAt: string;
  origin: 'manual' | 'automatico';
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

export interface OverallClosureSnapshotDto {
  editionId: string;
  at: string;
  actor: string;
  note?: string;
}

export interface StaffSnapshotDto {
  roleAssignmentId: string;
  name: string;
  email: string;
  initials: string;
  role: 'Admin da edição' | 'Gestor de modalidade';
  scope: string;
  revoked?: boolean;
  superAdmin?: boolean;
}

/**
 * Super administrador sem papel nenhum nesta edição.
 *
 * `staff` é derivado de EditionStaffRole e super admin não tem linha lá — a
 * lista irmã existe para que a conta apareça na tela mesmo assim. Quem também
 * tem papel na edição fica só no card de `staff`, marcado com `superAdmin`.
 */
export interface SuperAdminSnapshotDto {
  id: string;
  name: string;
  email: string;
  initials: string;
}

export interface AuditSnapshotDto {
  id: string;
  at: string;
  actor: string;
  action: string;
  entity: string;
  before?: string;
  after?: string;
  reason?: string;
}

export interface FrontendSnapshotDto {
  competitions: CompetitionSnapshotDto[];
  editions: EditionSnapshotDto[];
  teams: Record<string, TeamSnapshotDto>;
  athletes: Record<string, AthleteSnapshotDto>;
  disciplines: Record<string, DisciplineSnapshotDto>;
  tournaments: Record<string, TournamentSnapshotDto>;
  matches: Record<string, MatchSnapshotDto>;
  overallRanking: {
    metrics: OverallMetricSnapshotDto[];
    awards: OverallAwardSnapshotDto[];
    closures: OverallClosureSnapshotDto[];
  };
  staff: Record<string, StaffSnapshotDto>;
  superAdmins: SuperAdminSnapshotDto[];
  audit: AuditSnapshotDto[];
}

export interface SnapshotEnvelopeDto {
  data: FrontendSnapshotDto;
  meta: {
    revision: number;
  };
}

export interface SnapshotResultDto {
  snapshot: FrontendSnapshotDto;
  revision: number;
  etag: string;
}
