import { Injectable } from '@nestjs/common';
import {
  EditionStatus,
  EventType,
  MatchEventSide,
  MatchStatus,
  OverallAwardOrigin,
  OverallPosition,
  PhaseType,
  Prisma,
  TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { ResolvedEdition } from './active-edition.resolver';
import {
  AthleteSnapshotDto,
  AuditSnapshotDto,
  CompetitionSnapshotDto,
  DisciplineRuleSnapshotDto,
  DisciplineSnapshotDto,
  EditionSnapshotDto,
  FrontendSnapshotDto,
  MatchCorrectionSnapshotDto,
  MatchEventSnapshotDto,
  MatchSnapshotDto,
  MatchScoreSnapshotDto,
  MatchTiebreakSnapshotDto,
  OverallPositionSnapshot,
  PhaseStandingSnapshotDto,
  StaffSnapshotDto,
  SuperAdminSnapshotDto,
  TournamentAdvancementSnapshotDto,
  TournamentPhaseSnapshotDto,
  TournamentSnapshotDto,
} from './dto/frontend-snapshot.dto';
import { UploadsService } from '../uploads/uploads.service';

export type SnapshotScope = { kind: 'full' } | { kind: 'discipline'; editionDisciplineId: string };

interface SnapshotBuildOptions {
  public: boolean;
  scope: SnapshotScope;
  operatorDeviceId?: string;
}

@Injectable()
export class SnapshotMapper {
  constructor(private readonly uploads: UploadsService) {}

  async build(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    options: SnapshotBuildOptions,
  ): Promise<FrontendSnapshotDto> {
    const context = await this.loadContext(
      transaction,
      edition,
      !options.public && options.scope.kind === 'full',
    );
    const editionDisciplines = await transaction.editionDiscipline.findMany({
      where: {
        editionId: edition.id,
        ...(options.scope.kind === 'discipline' ? { id: options.scope.editionDisciplineId } : {}),
      },
      orderBy: { discipline: { name: 'asc' } },
      select: {
        id: true,
        config: true,
        createdAt: true,
        discipline: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            isIndividual: true,
          },
        },
      },
    });
    const editionDisciplineIds = editionDisciplines.map((item) => item.id);

    const tournaments = await transaction.tournament.findMany({
      where: {
        editionDisciplineId: { in: editionDisciplineIds },
        ...(options.public ? { status: { not: TournamentStatus.DRAFT } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        editionDisciplineId: true,
        name: true,
        format: true,
        status: true,
        config: true,
        createdAt: true,
      },
    });
    const tournamentIds = tournaments.map((item) => item.id);

    const [rosters, entries, phases, metrics, awards, closures] = await Promise.all([
      transaction.editionRoster.findMany({
        where: {
          editionDisciplineId: { in: editionDisciplineIds },
          status: { not: 'WITHDRAWN' },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          athleteId: true,
          teamId: true,
          editionDisciplineId: true,
        },
      }),
      transaction.tournamentEntry.findMany({
        where: { tournamentId: { in: tournamentIds } },
        orderBy: [{ seed: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          tournamentId: true,
          teamId: true,
          athleteId: true,
          seed: true,
          team: {
            select: {
              id: true,
              name: true,
              logoKey: true,
            },
          },
          athlete: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      transaction.phase.findMany({
        where: { tournamentId: { in: tournamentIds } },
        orderBy: [{ tournamentId: 'asc' }, { order: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          clientId: true,
          tournamentId: true,
          order: true,
          name: true,
          type: true,
          config: true,
        },
      }),
      transaction.overallMetric.findMany({
        where: { editionId: edition.id, removedAt: null },
        orderBy: [{ createdAt: 'asc' }, { clientId: 'asc' }],
        select: {
          clientId: true,
          name: true,
          defaultPoints: true,
          position: true,
        },
      }),
      transaction.overallAward.findMany({
        where: {
          editionId: edition.id,
          ...(options.scope.kind === 'discipline'
            ? { editionDisciplineId: options.scope.editionDisciplineId }
            : {}),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          editionId: true,
          teamId: true,
          metricId: true,
          points: true,
          note: true,
          origin: true,
          revokedAt: true,
          revokedByName: true,
          revokeReason: true,
          createdAt: true,
          editionDiscipline: {
            select: {
              discipline: { select: { name: true } },
            },
          },
        },
      }),
      transaction.overallClosure.findMany({
        where: { editionId: edition.id, reopenedAt: null },
        orderBy: [{ closedAt: 'asc' }, { id: 'asc' }],
        select: {
          closedAt: true,
          actorName: true,
          note: true,
        },
      }),
    ]);

    const publishedDisciplineIds = new Set(
      tournaments.map((tournament) => tournament.editionDisciplineId),
    );
    const publishedTeamIds = new Set(
      entries.flatMap((entry) => (entry.teamId ? [entry.teamId] : [])),
    );
    const publishedIndividualAthleteIds = new Set(
      entries.flatMap((entry) => (entry.athleteId ? [entry.athleteId] : [])),
    );
    const snapshotRosters = options.public
      ? rosters.filter(
          (roster) =>
            publishedDisciplineIds.has(roster.editionDisciplineId) &&
            ((roster.teamId !== null && publishedTeamIds.has(roster.teamId)) ||
              publishedIndividualAthleteIds.has(roster.athleteId)),
        )
      : rosters;
    const scopedAthleteIds = new Set(snapshotRosters.map((roster) => roster.athleteId));
    if (options.public) {
      for (const athleteId of publishedIndividualAthleteIds) scopedAthleteIds.add(athleteId);
    }
    const filteredEditionAthletes = await transaction.editionAthlete.findMany({
      where: {
        editionId: edition.id,
        ...(options.public ? { removed: false } : {}),
        ...(options.public || options.scope.kind === 'discipline'
          ? { athleteId: { in: [...scopedAthleteIds] } }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { athleteId: 'asc' }],
      select: {
        athleteId: true,
        teamId: true,
        removed: true,
        athlete: {
          select: {
            name: true,
          },
        },
      },
    });
    const scopedTeamIds = new Set<string>();
    for (const roster of rosters) if (roster.teamId) scopedTeamIds.add(roster.teamId);
    for (const entry of entries) if (entry.teamId) scopedTeamIds.add(entry.teamId);
    for (const athlete of filteredEditionAthletes) {
      if (athlete.teamId) scopedTeamIds.add(athlete.teamId);
    }

    const editionTeams = await transaction.editionTeam.findMany({
      where: {
        editionId: edition.id,
        ...(options.scope.kind === 'discipline' ? { teamId: { in: [...scopedTeamIds] } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { teamId: 'asc' }],
      select: {
        teamId: true,
        archived: true,
        team: {
          select: {
            name: true,
            initials: true,
            responsible: true,
            logoKey: true,
          },
        },
      },
    });

    const phaseIds = phases.map((item) => item.id);
    const [groups, matches, phaseStandings] = await Promise.all([
      transaction.group.findMany({
        where: { phaseId: { in: phaseIds } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, phaseId: true, name: true },
      }),
      transaction.match.findMany({
        where: { phaseId: { in: phaseIds } },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          phaseId: true,
          groupId: true,
          entryAId: true,
          entryBId: true,
          scoreA: true,
          scoreB: true,
          currentPeriod: true,
          clockSeconds: true,
          runningSince: true,
          paused: true,
          periodScoreA: true,
          periodScoreB: true,
          startedAt: true,
          startNote: true,
          operatorId: true,
          operatorDeviceId: true,
          operatorName: true,
          operatorHeartbeat: true,
          tiebreak: true,
          walkoverWinnerEntryId: true,
          reason: true,
          status: true,
          scheduledAt: true,
          venue: true,
          createdAt: true,
        },
      }),
      transaction.phaseStanding.findMany({
        where: { phaseId: { in: phaseIds } },
        orderBy: [{ phaseId: 'asc' }, { rank: 'asc' }, { points: 'desc' }, { entryId: 'asc' }],
        select: {
          phaseId: true,
          entryId: true,
          played: true,
          won: true,
          drawn: true,
          lost: true,
          scoreFor: true,
          scoreAgainst: true,
          points: true,
          disciplinary: true,
          rank: true,
        },
      }),
    ]);

    const groupIds = groups.map((item) => item.id);
    const matchIds = matches.map((item) => item.id);
    const [groupEntries, matchEvents, periodResults, corrections] = await Promise.all([
      transaction.groupEntry.findMany({
        where: { groupId: { in: groupIds } },
        select: { groupId: true, entryId: true },
      }),
      transaction.matchEvent.findMany({
        where: { matchId: { in: matchIds }, undoneAt: null },
        orderBy: [{ matchId: 'asc' }, { sequence: 'desc' }],
        select: {
          id: true,
          matchId: true,
          type: true,
          metadata: true,
          detail: true,
          side: true,
          elapsedSeconds: true,
          period: true,
          periodElapsedSeconds: true,
          scoreA: true,
          scoreB: true,
          points: true,
          previousScore: true,
          occurredAt: true,
        },
      }),
      transaction.matchPeriodResult.findMany({
        where: { matchId: { in: matchIds } },
        orderBy: [{ matchId: 'asc' }, { period: 'asc' }],
        select: { matchId: true, period: true, scoreA: true, scoreB: true },
      }),
      transaction.matchCorrection.findMany({
        where: { matchId: { in: matchIds } },
        orderBy: [{ matchId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          matchId: true,
          actorName: true,
          reason: true,
          beforeState: true,
          afterState: true,
          createdAt: true,
        },
      }),
    ]);

    const [staffRoles, superAdminAccounts, audit] = await Promise.all([
      options.public || options.scope.kind === 'discipline'
        ? Promise.resolve<Record<string, StaffSnapshotDto>>({})
        : this.loadStaff(transaction, edition),
      this.loadSuperAdmins(transaction, options),
      options.public || options.scope.kind === 'discipline'
        ? Promise.resolve<AuditSnapshotDto[]>([])
        : this.loadAudit(transaction, edition.id),
    ]);
    const { staff, superAdmins } = this.mergeSuperAdmins(staffRoles, superAdminAccounts);

    const disciplineById = new Map(editionDisciplines.map((item) => [item.id, item]));
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const phasesById = new Map(phases.map((phase) => [phase.id, phase]));
    const tournamentsById = new Map(tournaments.map((tournament) => [tournament.id, tournament]));
    const standingsByPhase = new Map<string, PhaseStandingSnapshotDto[]>();
    for (const standing of phaseStandings) {
      const entry = entriesById.get(standing.entryId);
      const entryName = entry ? this.entryName(entry) : undefined;
      if (!entryName) continue;
      const mapped = standingsByPhase.get(standing.phaseId) ?? [];
      mapped.push({
        entryId: standing.entryId,
        entryName,
        played: standing.played,
        won: standing.won,
        drawn: standing.drawn,
        lost: standing.lost,
        scoreFor: standing.scoreFor,
        scoreAgainst: standing.scoreAgainst,
        points: standing.points,
        disciplinary: standing.disciplinary,
        rank: standing.rank,
      });
      standingsByPhase.set(standing.phaseId, mapped);
    }
    const groupNamesByPhase = new Map<string, string[]>();
    const groupNameById = new Map<string, string>();
    for (const group of groups) {
      groupNameById.set(group.id, group.name);
      const names = groupNamesByPhase.get(group.phaseId) ?? [];
      names.push(group.name);
      groupNamesByPhase.set(group.phaseId, names);
    }
    const assignmentsByTournament = this.mapAssignments(
      groupEntries,
      groups,
      phasesById,
      entriesById,
    );
    const rulesByDisciplineId = new Map(
      editionDisciplines.map((item) => [item.id, this.mapRules(item.config)]),
    );

    return {
      competitions: context.competitions,
      editions: context.editions,
      teams: Object.fromEntries(
        editionTeams.map((item) => [
          item.teamId,
          {
            name: item.team.name,
            ...(item.team.initials ? { initials: item.team.initials } : {}),
            ...(!options.public && item.team.responsible
              ? { responsible: item.team.responsible }
              : {}),
            ...(item.team.logoKey ? { logo: this.logoPath(item.team.logoKey) } : {}),
            archived: item.archived,
            created: true,
          },
        ]),
      ),
      athletes: this.mapAthletes(
        filteredEditionAthletes,
        snapshotRosters,
        disciplineById,
        options.public,
      ),
      disciplines: this.mapDisciplines(editionDisciplines, tournaments),
      tournaments: this.mapTournaments(
        edition,
        tournaments,
        entries,
        phases,
        disciplineById,
        groupNamesByPhase,
        assignmentsByTournament,
        standingsByPhase,
      ),
      matches: this.mapMatches({
        edition,
        isPublic: options.public,
        requestOperatorDeviceId: options.operatorDeviceId,
        matches,
        phasesById,
        tournamentsById,
        disciplineById,
        entriesById,
        rulesByDisciplineId,
        groupNameById,
        matchEvents,
        periodResults,
        corrections,
      }),
      overallRanking: {
        metrics: metrics.map((metric) => ({
          id: metric.clientId,
          name: metric.name,
          defaultPoints: metric.defaultPoints,
          ...(metric.position ? { position: this.mapOverallPosition(metric.position) } : {}),
        })),
        awards: awards.map((award) => ({
          id: award.id,
          editionId: award.editionId,
          teamId: award.teamId,
          discipline: award.editionDiscipline.discipline.name,
          metricId: award.metricId,
          points: award.points,
          ...(award.note ? { note: award.note } : {}),
          createdAt: award.createdAt.toISOString(),
          origin: award.origin === OverallAwardOrigin.AUTOMATIC ? 'automatico' : 'manual',
          ...(award.revokedAt ? { revokedAt: award.revokedAt.toISOString() } : {}),
          ...(!options.public && award.revokedByName ? { revokedBy: award.revokedByName } : {}),
          ...(award.revokeReason ? { revokeReason: award.revokeReason } : {}),
        })),
        closures: closures.map((closure) => ({
          editionId: edition.id,
          at: closure.closedAt.toISOString(),
          actor: options.public ? 'Organização' : closure.actorName,
          ...(closure.note ? { note: closure.note } : {}),
        })),
      },
      staff,
      superAdmins,
      audit,
    };
  }

  private async loadContext(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
    full: boolean,
  ): Promise<{
    competitions: CompetitionSnapshotDto[];
    editions: EditionSnapshotDto[];
  }> {
    if (!full) {
      return {
        competitions: [
          {
            id: edition.competition.id,
            name: edition.competition.name,
            slug: edition.competition.slug,
            active: edition.competition.isActive,
          },
        ],
        editions: [this.mapEdition(edition)],
      };
    }

    const [competitions, editions] = await Promise.all([
      transaction.competition.findMany({
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
        },
      }),
      transaction.competitionEdition.findMany({
        orderBy: [{ competitionId: 'asc' }, { year: 'desc' }, { id: 'asc' }],
        select: {
          id: true,
          competitionId: true,
          year: true,
          name: true,
          startDate: true,
          endDate: true,
          status: true,
          isActive: true,
        },
      }),
    ]);

    return {
      competitions: competitions.map((competition) => ({
        id: competition.id,
        name: competition.name,
        slug: competition.slug,
        active: competition.isActive,
      })),
      editions: editions.map((item) => this.mapEdition(item)),
    };
  }

  private mapEdition(edition: {
    id: string;
    competitionId: string;
    year: number;
    name: string;
    startDate: Date;
    endDate: Date;
    status: EditionStatus;
    isActive: boolean;
  }): EditionSnapshotDto {
    return {
      id: edition.id,
      name: edition.name,
      year: edition.year,
      start: this.toDate(edition.startDate),
      end: this.toDate(edition.endDate),
      status: this.mapEditionStatus(edition.status),
      active: edition.isActive,
      competitionId: edition.competitionId,
    };
  }

  private mapAthletes(
    editionAthletes: Array<{
      athleteId: string;
      teamId: string | null;
      removed: boolean;
      athlete: { name: string };
    }>,
    rosters: Array<{ athleteId: string; editionDisciplineId: string }>,
    disciplineById: Map<string, { discipline: { name: string } }>,
    isPublic: boolean,
  ): Record<string, AthleteSnapshotDto> {
    const modalitiesByAthlete = new Map<string, Set<string>>();
    for (const roster of rosters) {
      const disciplineName = disciplineById.get(roster.editionDisciplineId)?.discipline.name;
      if (!disciplineName) continue;
      const modalities = modalitiesByAthlete.get(roster.athleteId) ?? new Set<string>();
      modalities.add(disciplineName);
      modalitiesByAthlete.set(roster.athleteId, modalities);
    }

    return Object.fromEntries(
      editionAthletes.map((item) => [
        item.athleteId,
        {
          name: item.athlete.name,
          ...(item.teamId ? { teamId: item.teamId } : {}),
          modalities: [...(modalitiesByAthlete.get(item.athleteId) ?? [])].sort(),
          ...(!isPublic ? { created: true } : {}),
          removed: item.removed,
        },
      ]),
    );
  }

  private mapDisciplines(
    editionDisciplines: Array<{
      id: string;
      config: Prisma.JsonValue | null;
      createdAt: Date;
      discipline: {
        name: string;
        description: string | null;
        isIndividual: boolean;
      };
    }>,
    tournaments: Array<{
      editionDisciplineId: string;
      status: TournamentStatus;
      createdAt: Date;
    }>,
  ): Record<string, DisciplineSnapshotDto> {
    return Object.fromEntries(
      editionDisciplines.map((item) => {
        const config = this.asRecord(item.config);
        const disciplineTournaments = tournaments.filter(
          (tournament) => tournament.editionDisciplineId === item.id,
        );
        const firstStarted = disciplineTournaments.find(
          (tournament) =>
            tournament.status === TournamentStatus.ONGOING ||
            tournament.status === TournamentStatus.FINISHED,
        );
        const rules = this.mapRules(item.config);

        return [
          item.discipline.name,
          {
            ...(item.discipline.description ? { config: item.discipline.description } : {}),
            ...(rules ? { rules } : {}),
            enabled: this.booleanValue(config?.enabled, true),
            created: true,
            name: item.discipline.name,
            mode: item.discipline.isIndividual ? 'Individual' : 'Coletiva',
            tournaments: disciplineTournaments.length,
            ...(firstStarted ? { startedAt: firstStarted.createdAt.toISOString() } : {}),
          },
        ];
      }),
    );
  }

  private mapTournaments(
    edition: ResolvedEdition,
    tournaments: Array<{
      id: string;
      editionDisciplineId: string;
      name: string;
      format: TournamentFormat;
      status: TournamentStatus;
      config: Prisma.JsonValue | null;
    }>,
    entries: Array<{
      id: string;
      tournamentId: string;
      seed: number | null;
      team: { name: string } | null;
      athlete: { name: string } | null;
    }>,
    phases: Array<{
      id: string;
      clientId: string;
      tournamentId: string;
      name: string;
      type: PhaseType;
      config: Prisma.JsonValue | null;
    }>,
    disciplineById: Map<string, { discipline: { name: string } }>,
    groupNamesByPhase: Map<string, string[]>,
    assignmentsByTournament: Map<string, Record<string, string>>,
    standingsByPhase: Map<string, PhaseStandingSnapshotDto[]>,
  ): Record<string, TournamentSnapshotDto> {
    return Object.fromEntries(
      tournaments.map((tournament) => {
        const disciplineName =
          disciplineById.get(tournament.editionDisciplineId)?.discipline.name ??
          'Modalidade não definida';
        const tournamentEntries = entries.filter((entry) => entry.tournamentId === tournament.id);
        const namedEntries = tournamentEntries
          .map((entry) => ({ entry, name: entry.team?.name ?? entry.athlete?.name }))
          .filter((item): item is { entry: (typeof tournamentEntries)[number]; name: string } =>
            Boolean(item.name),
          );
        const config = this.asRecord(tournament.config);
        const mappedPhases = phases
          .filter((phase) => phase.tournamentId === tournament.id)
          .map((phase): TournamentPhaseSnapshotDto => ({
            id: phase.clientId,
            name: phase.name,
            format: this.mapPhaseType(phase.type),
            groups: groupNamesByPhase.get(phase.id) ?? [],
            qualifiers: this.numberValue(this.asRecord(phase.config)?.qualifiers, 1),
            standings: standingsByPhase.get(phase.id) ?? [],
          }));
        const seeds = Object.fromEntries(
          namedEntries
            .filter((item) => item.entry.seed !== null)
            .map((item) => [item.name, item.entry.seed as number]),
        );
        const advancement = this.mapAdvancement(config?.advancement);
        const byes = this.stringRecord(config?.byes);

        return [
          tournament.id,
          {
            status: this.mapTournamentStatus(tournament.status),
            participants: namedEntries.map((item) => item.name),
            seeds,
            phases: mappedPhases,
            assignments: assignmentsByTournament.get(tournament.id) ?? {},
            generated: this.booleanValue(config?.generated, false),
            editionId: edition.id,
            created: true,
            name: tournament.name,
            discipline: disciplineName,
            format: this.mapTournamentFormat(tournament.format),
            ...(advancement ? { advancement } : {}),
            ...(byes ? { byes } : {}),
          },
        ];
      }),
    );
  }

  private mapMatches(input: {
    edition: ResolvedEdition;
    isPublic: boolean;
    requestOperatorDeviceId?: string;
    matches: Array<{
      id: string;
      phaseId: string;
      groupId: string | null;
      entryAId: string | null;
      entryBId: string | null;
      scoreA: number;
      scoreB: number;
      currentPeriod: number;
      clockSeconds: number;
      runningSince: Date | null;
      paused: boolean;
      periodScoreA: number;
      periodScoreB: number;
      startedAt: Date | null;
      startNote: string | null;
      operatorId: string | null;
      operatorDeviceId: string | null;
      operatorName: string | null;
      operatorHeartbeat: Date | null;
      tiebreak: Prisma.JsonValue | null;
      walkoverWinnerEntryId: string | null;
      reason: string | null;
      status: MatchStatus;
      scheduledAt: Date | null;
      venue: string | null;
    }>;
    phasesById: Map<string, { id: string; tournamentId: string; name: string }>;
    tournamentsById: Map<string, { id: string; editionDisciplineId: string }>;
    disciplineById: Map<string, { discipline: { name: string } }>;
    entriesById: Map<
      string,
      {
        id: string;
        team: { name: string; logoKey: string | null } | null;
        athlete: { name: string } | null;
      }
    >;
    rulesByDisciplineId: Map<string, DisciplineRuleSnapshotDto | undefined>;
    groupNameById: Map<string, string>;
    matchEvents: Array<{
      id: string;
      matchId: string;
      type: EventType;
      metadata: Prisma.JsonValue | null;
      detail: string | null;
      side: MatchEventSide;
      elapsedSeconds: number;
      period: number | null;
      periodElapsedSeconds: number | null;
      scoreA: number | null;
      scoreB: number | null;
      points: number | null;
      previousScore: Prisma.JsonValue | null;
      occurredAt: Date;
    }>;
    periodResults: Array<{ matchId: string; period: number; scoreA: number; scoreB: number }>;
    corrections: Array<{
      id: string;
      matchId: string;
      actorName: string;
      reason: string;
      beforeState: Prisma.JsonValue;
      afterState: Prisma.JsonValue;
      createdAt: Date;
    }>;
  }): Record<string, MatchSnapshotDto> {
    return Object.fromEntries(
      input.matches.flatMap((match) => {
        const phase = input.phasesById.get(match.phaseId);
        const tournament = phase ? input.tournamentsById.get(phase.tournamentId) : undefined;
        const discipline = tournament
          ? input.disciplineById.get(tournament.editionDisciplineId)
          : undefined;
        if (!phase || !tournament || !discipline) return [];

        const entryA = match.entryAId ? input.entriesById.get(match.entryAId) : undefined;
        const entryB = match.entryBId ? input.entriesById.get(match.entryBId) : undefined;
        const walkoverWinner = match.walkoverWinnerEntryId
          ? input.entriesById.get(match.walkoverWinnerEntryId)
          : undefined;
        const scheduled = match.scheduledAt;
        const rules = input.rulesByDisciplineId.get(tournament.editionDisciplineId);
        const tiebreak = this.mapTiebreak(match.tiebreak, input.isPublic);
        const entryAName = entryA ? this.entryName(entryA) : undefined;
        const entryBName = entryB ? this.entryName(entryB) : undefined;
        const walkoverWinnerName = walkoverWinner ? this.entryName(walkoverWinner) : undefined;

        const mapped: MatchSnapshotDto = {
          ...(scheduled ? { date: this.toDate(scheduled), time: this.toTime(scheduled) } : {}),
          ...(match.venue ? { venue: match.venue } : {}),
          status: this.mapMatchStatus(match.status),
          ...(match.reason ? { reason: match.reason } : {}),
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          created: true,
          editionId: input.edition.id,
          discipline: discipline.discipline.name,
          ...(entryAName ? { entryA: entryAName } : {}),
          ...(entryBName ? { entryB: entryBName } : {}),
          ...(entryA?.team?.logoKey ? { logoA: this.logoPath(entryA.team.logoKey) } : {}),
          ...(entryB?.team?.logoKey ? { logoB: this.logoPath(entryB.team.logoKey) } : {}),
          phase: match.groupId
            ? (input.groupNameById.get(match.groupId) ?? phase.name)
            : phase.name,
          tournamentId: tournament.id,
          ...(rules ? { rules } : {}),
          currentPeriod: match.currentPeriod,
          clockSeconds: match.clockSeconds,
          ...(match.runningSince ? { runningSince: match.runningSince.toISOString() } : {}),
          paused: match.paused,
          events: input.matchEvents
            .filter((event) => event.matchId === match.id)
            .map((event) => this.mapMatchEvent(event)),
          ...(!input.isPublic && match.operatorId
            ? {
                operatorId:
                  match.operatorDeviceId && match.operatorDeviceId === input.requestOperatorDeviceId
                    ? match.operatorDeviceId
                    : '__occupied__',
              }
            : {}),
          ...(!input.isPublic && match.operatorName ? { operatorName: match.operatorName } : {}),
          ...(!input.isPublic && match.operatorHeartbeat
            ? { operatorHeartbeat: match.operatorHeartbeat.toISOString() }
            : {}),
          periodScoreA: match.periodScoreA,
          periodScoreB: match.periodScoreB,
          periodResults: input.periodResults
            .filter((result) => result.matchId === match.id)
            .map(({ period, scoreA, scoreB }) => ({ period, scoreA, scoreB })),
          ...(match.startedAt ? { startedAt: match.startedAt.toISOString() } : {}),
          ...(!input.isPublic && match.operatorName ? { startedBy: match.operatorName } : {}),
          ...(!input.isPublic && match.startNote ? { startNote: match.startNote } : {}),
          ...(tiebreak ? { tiebreak } : {}),
          corrections: input.corrections
            .filter((correction) => correction.matchId === match.id)
            .map((correction) => this.mapCorrection(correction, input.isPublic)),
          ...(walkoverWinnerName ? { walkoverWinner: walkoverWinnerName } : {}),
        };

        return [[match.id, mapped]];
      }),
    );
  }

  private async loadStaff(
    transaction: Prisma.TransactionClient,
    edition: ResolvedEdition,
  ): Promise<Record<string, StaffSnapshotDto>> {
    const roles = await transaction.editionStaffRole.findMany({
      where: { editionId: edition.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staffId: true,
        editionDisciplineId: true,
        role: true,
        revokedAt: true,
        staff: { select: { name: true, email: true } },
        editionDiscipline: {
          select: { discipline: { select: { name: true } } },
        },
      },
    });

    // Revogar e reconceder acesso não reescreve a atribuição — grava uma linha
    // nova e marca a antiga com revokedAt. Sem esta deduplicação, cada ciclo de
    // revogar+reativar deixava as duas na tela: um card fantasma "Revogado" ao
    // lado do card ativo da mesma pessoa. A ordenação ascendente por criação
    // garante que, ao sobrescrever a mesma chave, sobra a atribuição mais
    // recente — a pessoa continua podendo ter mais de um papel ativo ao mesmo
    // tempo (ex.: gestor de duas modalidades), só não duplica o histórico.
    const latestByAssignment = new Map<string, (typeof roles)[number]>();
    for (const assignment of roles) {
      const key = `${assignment.staffId}:${assignment.role}:${assignment.editionDisciplineId ?? ''}`;
      latestByAssignment.set(key, assignment);
    }

    const staff: Record<string, StaffSnapshotDto> = {};
    for (const assignment of latestByAssignment.values()) {
      staff[assignment.id] = {
        roleAssignmentId: assignment.id,
        name: assignment.staff.name,
        email: assignment.staff.email,
        initials: this.initials(assignment.staff.name),
        role: assignment.role === 'EDITION_ADMIN' ? 'Admin da edição' : 'Gestor de modalidade',
        scope:
          assignment.role === 'EDITION_ADMIN'
            ? edition.name
            : (assignment.editionDiscipline?.discipline.name ?? 'Modalidade não definida'),
        ...(assignment.revokedAt ? { revoked: true } : {}),
      };
    }
    return staff;
  }

  /**
   * Contas com a flag global `Staff.isSuperAdmin`.
   *
   * Promover alguém a super admin não cria linha em EditionStaffRole, então
   * loadStaff — que lê só aquela tabela — não enxerga essas contas. Sem esta
   * consulta, conceder super admin não muda nada na tela de staff e a ação
   * parece não ter funcionado.
   */
  private async loadSuperAdmins(
    transaction: Prisma.TransactionClient,
    options: SnapshotBuildOptions,
  ): Promise<SuperAdminSnapshotDto[]> {
    // Mesma guarda de loadStaff: o snapshot público e o recorte por modalidade
    // não expõem ninguém da organização. Aqui a guarda mora dentro da função
    // porque a lista sai de uma tabela global, sem filtro por edição para
    // limitar o estrago caso a chamada escape do lugar certo.
    if (options.public || options.scope.kind === 'discipline') return [];

    const accounts = await transaction.staff.findMany({
      where: { isSuperAdmin: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, email: true },
    });

    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      initials: this.initials(account.name),
    }));
  }

  /**
   * Casa a flag global com os cards de papel da edição.
   *
   * Quem é super admin e também tem papel aqui apareceria duas vezes na tela —
   * uma pelo card do papel, outra pela lista irmã. Nesse caso o card existente
   * recebe a marca e a lista não repete a pessoa; a lista fica só para quem não
   * tem papel nenhum nesta edição e, sem ela, não apareceria em lugar algum.
   */
  private mergeSuperAdmins(
    staff: Record<string, StaffSnapshotDto>,
    accounts: SuperAdminSnapshotDto[],
  ): { staff: Record<string, StaffSnapshotDto>; superAdmins: SuperAdminSnapshotDto[] } {
    const promoted = new Set(accounts.map((account) => this.emailKey(account.email)));
    const withRole = new Set(Object.values(staff).map((card) => this.emailKey(card.email)));

    return {
      staff: Object.fromEntries(
        Object.entries(staff).map(([id, card]) => [
          id,
          promoted.has(this.emailKey(card.email)) ? { ...card, superAdmin: true } : card,
        ]),
      ),
      superAdmins: accounts.filter((account) => !withRole.has(this.emailKey(account.email))),
    };
  }

  private async loadAudit(
    transaction: Prisma.TransactionClient,
    editionId: string,
  ): Promise<AuditSnapshotDto[]> {
    const logs = await transaction.auditLog.findMany({
      where: { editionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeData: true,
        afterData: true,
        reason: true,
        createdAt: true,
        staff: { select: { name: true } },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      actor: log.staff?.name ?? 'Sistema',
      action: log.action,
      entity: `${log.entityType} ${log.entityId}`,
      ...(log.beforeData !== null ? { before: this.jsonText(log.beforeData) } : {}),
      ...(log.afterData !== null ? { after: this.jsonText(log.afterData) } : {}),
      ...(log.reason ? { reason: log.reason } : {}),
    }));
  }

  private mapAssignments(
    groupEntries: Array<{ groupId: string; entryId: string }>,
    groups: Array<{ id: string; phaseId: string; name: string }>,
    phasesById: Map<string, { tournamentId: string }>,
    entriesById: Map<string, { team: { name: string } | null; athlete: { name: string } | null }>,
  ): Map<string, Record<string, string>> {
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const assignments = new Map<string, Record<string, string>>();
    for (const relation of groupEntries) {
      const group = groupById.get(relation.groupId);
      const phase = group ? phasesById.get(group.phaseId) : undefined;
      const entry = entriesById.get(relation.entryId);
      const entryName = entry ? this.entryName(entry) : undefined;
      if (!group || !phase || !entryName) continue;
      const tournamentAssignments = assignments.get(phase.tournamentId) ?? {};
      tournamentAssignments[entryName] = group.name;
      assignments.set(phase.tournamentId, tournamentAssignments);
    }
    return assignments;
  }

  private mapMatchEvent(event: {
    id: string;
    type: EventType;
    metadata: Prisma.JsonValue | null;
    detail: string | null;
    side: MatchEventSide;
    elapsedSeconds: number;
    period: number | null;
    periodElapsedSeconds: number | null;
    scoreA: number | null;
    scoreB: number | null;
    points: number | null;
    previousScore: Prisma.JsonValue | null;
    occurredAt: Date;
  }): MatchEventSnapshotDto {
    const previous = this.mapPreviousScore(event.previousScore);
    const type = this.eventLabel(event.type, event.metadata);
    return {
      id: event.id,
      at: event.occurredAt.toISOString(),
      elapsedSeconds: event.elapsedSeconds,
      ...(event.period !== null ? { period: event.period } : {}),
      ...(event.periodElapsedSeconds !== null
        ? { periodElapsedSeconds: event.periodElapsedSeconds }
        : {}),
      type,
      detail: event.detail ?? type,
      side: this.mapEventSide(event.side),
      scoreA: event.scoreA ?? 0,
      scoreB: event.scoreB ?? 0,
      ...(previous ? { previousScoreA: previous.scoreA, previousScoreB: previous.scoreB } : {}),
      ...(event.points !== null ? { points: event.points } : {}),
      ...(previous ? { previous } : {}),
    };
  }

  private eventLabel(type: EventType, metadata: Prisma.JsonValue | null): string {
    const clientType = this.asRecord(metadata)?.clientType;
    if (typeof clientType === 'string') {
      const normalized = clientType.trim();
      if (normalized.length >= 1 && normalized.length <= 100) return normalized;
    }
    const labels: Record<EventType, string> = {
      [EventType.GOAL]: 'Gol',
      [EventType.ASSIST]: 'Assistência',
      [EventType.YELLOW_CARD]: 'Cartão amarelo',
      [EventType.RED_CARD]: 'Cartão vermelho',
      [EventType.POINT]: 'Ponto',
      [EventType.SET_WON]: 'Set vencido',
      [EventType.FOUL]: 'Falta',
      [EventType.TIMEOUT_CALLED]: 'Tempo técnico',
      [EventType.SUBSTITUTION]: 'Substituição',
      [EventType.DISQUALIFICATION]: 'Desclassificação',
      [EventType.CHECKMATE]: 'Xeque-mate',
      [EventType.WALKOVER_DECLARED]: 'W.O.',
      [EventType.OTHER]: 'Outro',
    };
    return labels[type];
  }

  private mapPreviousScore(value: Prisma.JsonValue | null): MatchScoreSnapshotDto | undefined {
    const record = this.asRecord(value);
    if (!record) return undefined;
    const scoreA = this.optionalNumber(record.scoreA);
    const scoreB = this.optionalNumber(record.scoreB);
    const periodScoreA = this.optionalNumber(record.periodScoreA);
    const periodScoreB = this.optionalNumber(record.periodScoreB);
    const currentPeriod = this.optionalNumber(record.currentPeriod);
    if (
      scoreA === undefined ||
      scoreB === undefined ||
      periodScoreA === undefined ||
      periodScoreB === undefined ||
      currentPeriod === undefined
    ) {
      return undefined;
    }
    return { scoreA, scoreB, periodScoreA, periodScoreB, currentPeriod };
  }

  private mapTiebreak(
    value: Prisma.JsonValue | null,
    isPublic: boolean,
  ): MatchTiebreakSnapshotDto | undefined {
    const record = this.asRecord(value);
    if (!record) return undefined;
    const method = record.method;
    const allowedMethods = [
      'prorrogacao',
      'penaltis',
      'set-extra',
      'criterio-tecnico',
      'administrativo',
    ] as const;
    if (
      typeof method !== 'string' ||
      !allowedMethods.includes(method as (typeof allowedMethods)[number]) ||
      typeof record.label !== 'string' ||
      typeof record.winner !== 'string' ||
      typeof record.reason !== 'string' ||
      typeof record.at !== 'string'
    ) {
      return undefined;
    }

    return {
      method: method as (typeof allowedMethods)[number],
      label: record.label,
      scoreA: this.numberValue(record.scoreA, 0),
      scoreB: this.numberValue(record.scoreB, 0),
      winner: record.winner,
      reason: record.reason,
      decidedBy:
        isPublic || typeof record.decidedBy !== 'string' ? 'Organização' : record.decidedBy,
      at: record.at,
    };
  }

  private mapCorrection(
    correction: {
      id: string;
      actorName: string;
      reason: string;
      beforeState: Prisma.JsonValue;
      afterState: Prisma.JsonValue;
      createdAt: Date;
    },
    isPublic: boolean,
  ): MatchCorrectionSnapshotDto {
    return {
      id: correction.id,
      at: correction.createdAt.toISOString(),
      actor: isPublic ? 'Organização' : correction.actorName,
      reason: correction.reason,
      before: this.jsonText(correction.beforeState),
      after: this.jsonText(correction.afterState),
    };
  }

  private mapRules(value: Prisma.JsonValue | null): DisciplineRuleSnapshotDto | undefined {
    const config = this.asRecord(value);
    const rules = this.asRecord(config?.rules) ?? config;
    if (!rules) return undefined;
    const secondaryEvents = Array.isArray(rules.secondaryEvents)
      ? rules.secondaryEvents.filter((item): item is string => typeof item === 'string')
      : [];
    if (
      typeof rules.periodLabel !== 'string' ||
      typeof rules.periodCount !== 'number' ||
      typeof rules.periodDurationMinutes !== 'number' ||
      !['progressive', 'countdown', 'none'].includes(String(rules.clockMode)) ||
      typeof rules.scoringEvent !== 'string'
    ) {
      return undefined;
    }

    return {
      periodLabel: rules.periodLabel,
      periodCount: rules.periodCount,
      periodDurationMinutes: rules.periodDurationMinutes,
      clockMode: rules.clockMode as 'progressive' | 'countdown' | 'none',
      scoringEvent: rules.scoringEvent,
      secondaryEvents: [secondaryEvents[0] ?? '', secondaryEvents[1] ?? ''],
      ...this.optionalObjectArray('scoring', rules.scoring),
      ...this.optionalObjectArray('secondary', rules.secondary),
      ...this.optionalObject('completion', rules.completion),
      ...this.optionalObject('roster', rules.roster),
      ...this.optionalObject('standings', rules.standings),
      ...this.optionalObject('knockout', rules.knockout),
      ...this.optionalObject('walkover', rules.walkover),
    };
  }

  private mapAdvancement(value: unknown): TournamentAdvancementSnapshotDto | undefined {
    const advancement = this.asRecord(value);
    if (!advancement) return undefined;
    const crossing = advancement.crossing;
    if (crossing !== 'padrao' && crossing !== 'sequencial') return undefined;
    return {
      perGroup: this.numberValue(advancement.perGroup, 1),
      bestThirds: this.numberValue(advancement.bestThirds, 0),
      crossing,
      thirdPlaceMatch: this.booleanValue(advancement.thirdPlaceMatch, false),
    };
  }

  private optionalObject<K extends string>(
    key: K,
    value: unknown,
  ): Partial<Record<K, Record<string, unknown>>> {
    const record = this.asRecord(value);
    return record ? ({ [key]: record } as Record<K, Record<string, unknown>>) : {};
  }

  private optionalObjectArray<K extends string>(
    key: K,
    value: unknown,
  ): Partial<Record<K, Array<Record<string, unknown>>>> {
    if (!Array.isArray(value)) return {};
    const records = value
      .map((item) => this.asRecord(item))
      .filter((item): item is Record<string, unknown> => item !== undefined);
    return records.length ? ({ [key]: records } as Record<K, Array<Record<string, unknown>>>) : {};
  }

  private mapEditionStatus(status: EditionStatus): EditionSnapshotDto['status'] {
    const statuses: Record<EditionStatus, EditionSnapshotDto['status']> = {
      PLANNING: 'Planejamento',
      ONGOING: 'Em andamento',
      FINISHED: 'Finalizada',
      ARCHIVED: 'Arquivada',
    };
    return statuses[status];
  }

  private mapTournamentStatus(status: TournamentStatus): TournamentSnapshotDto['status'] {
    const statuses: Record<TournamentStatus, TournamentSnapshotDto['status']> = {
      DRAFT: 'Rascunho',
      SCHEDULED: 'Publicado',
      ONGOING: 'Em andamento',
      FINISHED: 'Encerrado',
      CANCELLED: 'Arquivado',
    };
    return statuses[status];
  }

  private mapMatchStatus(status: MatchStatus): MatchSnapshotDto['status'] {
    const statuses: Record<MatchStatus, MatchSnapshotDto['status']> = {
      SCHEDULED: 'Agendada',
      LIVE: 'Ao vivo',
      FINISHED: 'Encerrada',
      WALKOVER: 'W.O.',
      CANCELLED: 'Cancelada',
      POSTPONED: 'Adiada',
    };
    return statuses[status];
  }

  private mapPhaseType(type: PhaseType): TournamentPhaseSnapshotDto['format'] {
    const types: Record<PhaseType, TournamentPhaseSnapshotDto['format']> = {
      GROUP: 'Grupos',
      LEAGUE: 'Liga',
      KNOCKOUT: 'Mata-mata',
    };
    return types[type];
  }

  private mapTournamentFormat(format: TournamentFormat): string {
    const formats: Record<TournamentFormat, string> = {
      SINGLE_ELIMINATION: 'Mata-mata',
      GROUP_KNOCKOUT: 'Grupos e mata-mata',
      LEAGUE_KNOCKOUT: 'Liga e mata-mata',
      LEAGUE_ONLY: 'Liga',
      LEAGUE_LIMITED_KNOCKOUT: 'Liga limitada e mata-mata',
    };
    return formats[format];
  }

  private mapOverallPosition(position: OverallPosition): OverallPositionSnapshot {
    const positions: Record<OverallPosition, OverallPositionSnapshot> = {
      CHAMPION: 'campeao',
      RUNNER_UP: 'vice',
      THIRD: 'terceiro',
      PARTICIPATION: 'participacao',
    };
    return positions[position];
  }

  private mapEventSide(side: MatchEventSide): MatchEventSnapshotDto['side'] {
    if (side === MatchEventSide.HOME) return 'home';
    if (side === MatchEventSide.AWAY) return 'away';
    return 'neutral';
  }

  private entryName(entry: {
    team: { name: string } | null;
    athlete: { name: string } | null;
  }): string | undefined {
    return entry.team?.name ?? entry.athlete?.name ?? undefined;
  }

  private logoPath(fileKey: string): string {
    return this.uploads.publicUrl(fileKey);
  }

  private initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  // O e-mail é o único elo entre a conta e o papel de edição, e as duas linhas
  // são gravadas por caminhos diferentes: comparar sem normalizar arriscaria
  // transformar a mesma pessoa em dois cards por uma diferença de caixa.
  private emailKey(email: string): string {
    return email.trim().toLowerCase();
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, unknown>;
  }

  private stringRecord(value: unknown): Record<string, string> | undefined {
    const record = this.asRecord(value);
    if (!record) return undefined;
    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, string] => Boolean(entry[0]) && typeof entry[1] === 'string',
      ),
    );
  }

  private numberValue(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private jsonText(value: Prisma.JsonValue): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  private toDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toTime(value: Date): string {
    return value.toISOString().slice(11, 16);
  }
}
