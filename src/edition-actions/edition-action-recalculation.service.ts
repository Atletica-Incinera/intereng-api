import { Injectable } from '@nestjs/common';
import { MatchStatus, PhaseType, Prisma, TournamentStatus } from '@prisma/client';
import {
  ActionStandingsRule,
  ActionTiebreaker,
  resolveActionRegulation,
} from './action-regulation';

const OFFICIAL_STATUSES: MatchStatus[] = [MatchStatus.FINISHED, MatchStatus.WALKOVER];

interface StandingStats {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
  disciplinary: number;
}

interface CountedMatch {
  entryAId: string | null;
  entryBId: string | null;
  winnerEntryId: string | null;
  scoreA: number;
  scoreB: number;
  events: Array<{ entryId: string | null; metadata: Prisma.JsonValue | null }>;
}

interface AdvancementRule {
  perGroup: number;
  bestThirds: number;
  crossing: 'padrao' | 'sequencial';
  thirdPlaceMatch: boolean;
}

interface QualifierSlot {
  entryId: string;
  points: number;
  balance: number;
  scoreFor: number;
}

interface BracketPair {
  order: number;
  entryAId: string;
  entryBId: string | null;
}

@Injectable()
export class EditionActionRecalculationService {
  async recomputeTournament(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
  ): Promise<void> {
    const tournament = await transaction.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        status: true,
        config: true,
        editionDiscipline: {
          select: { config: true, discipline: { select: { name: true } } },
        },
        phases: {
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            order: true,
            type: true,
            config: true,
            groups: {
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                name: true,
                entries: { orderBy: { entryId: 'asc' }, select: { entryId: true } },
              },
            },
          },
        },
        entries: {
          orderBy: [{ seed: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            seed: true,
            team: { select: { name: true } },
            athlete: { select: { name: true } },
          },
        },
      },
    });
    if (!tournament) return;

    const regulation = resolveActionRegulation(
      tournament.editionDiscipline.discipline.name,
      tournament.editionDiscipline.config,
    );
    for (const phase of tournament.phases) {
      const computed: Prisma.PhaseStandingUncheckedCreateInput[] = [];
      if (phase.groups.length) {
        for (const group of phase.groups) {
          const entryIds = group.entries.map((entry) => entry.entryId);
          if (!entryIds.length) continue;
          const matches = await this.countedMatches(transaction, { groupId: group.id });
          computed.push(
            ...this.computeStandings(phase.id, entryIds, matches, regulation.standings),
          );
        }
      } else if (phase.type !== PhaseType.KNOCKOUT) {
        const entryIds = tournament.entries.map((entry) => entry.id);
        if (entryIds.length) {
          const matches = await this.countedMatches(transaction, {
            phaseId: phase.id,
            groupId: null,
          });
          computed.push(
            ...this.computeStandings(phase.id, entryIds, matches, regulation.standings),
          );
        }
      }
      await transaction.phaseStanding.deleteMany({ where: { phaseId: phase.id } });
      if (computed.length) await transaction.phaseStanding.createMany({ data: computed });
    }

    await this.progressKnockout(transaction, tournament);
  }

  private async countedMatches(
    transaction: Prisma.TransactionClient,
    where: { phaseId?: string; groupId?: string | null },
  ): Promise<CountedMatch[]> {
    return transaction.match.findMany({
      where: { ...where, status: { in: OFFICIAL_STATUSES } },
      orderBy: { id: 'asc' },
      select: {
        entryAId: true,
        entryBId: true,
        winnerEntryId: true,
        scoreA: true,
        scoreB: true,
        events: {
          where: { undoneAt: null },
          select: { entryId: true, metadata: true },
        },
      },
    });
  }

  private computeStandings(
    phaseId: string,
    entryIds: string[],
    matches: CountedMatch[],
    rule: ActionStandingsRule,
  ): Prisma.PhaseStandingUncheckedCreateInput[] {
    const stats = this.accumulate(entryIds, matches, rule);
    const pointBuckets = new Map<number, string[]>();
    for (const entryId of entryIds) {
      const points = stats.get(entryId)?.points ?? 0;
      pointBuckets.set(points, [...(pointBuckets.get(points) ?? []), entryId]);
    }
    const ordered = [...pointBuckets.entries()]
      .sort(([left], [right]) => right - left)
      .flatMap(([, block]) => this.rankBlock(block, matches, rule, stats, rule.tiebreakers));
    const ranks = new Map(ordered.map((entryId, index) => [entryId, index + 1]));

    return entryIds.map((entryId) => {
      const row = stats.get(entryId) ?? this.emptyStats();
      return {
        phaseId,
        entryId,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        scoreFor: row.scoreFor,
        scoreAgainst: row.scoreAgainst,
        points: row.points,
        disciplinary: row.disciplinary,
        rank: ranks.get(entryId) ?? null,
      };
    });
  }

  private accumulate(
    entryIds: string[],
    matches: CountedMatch[],
    rule: ActionStandingsRule,
  ): Map<string, StandingStats> {
    const rows = new Map(entryIds.map((entryId) => [entryId, this.emptyStats()]));
    for (const match of matches) {
      if (!match.entryAId || !match.entryBId) continue;
      const home = rows.get(match.entryAId);
      const away = rows.get(match.entryBId);
      if (!home || !away) continue;
      home.played += 1;
      away.played += 1;
      home.scoreFor += match.scoreA;
      home.scoreAgainst += match.scoreB;
      away.scoreFor += match.scoreB;
      away.scoreAgainst += match.scoreA;
      for (const event of match.events) {
        if (!event.entryId) continue;
        const eventRow = rows.get(event.entryId);
        if (eventRow) eventRow.disciplinary += this.fairPlayPoints(event.metadata);
      }
      if (match.winnerEntryId === match.entryAId) {
        home.won += 1;
        away.lost += 1;
        home.points += rule.win;
        away.points += rule.loss;
      } else if (match.winnerEntryId === match.entryBId) {
        away.won += 1;
        home.lost += 1;
        away.points += rule.win;
        home.points += rule.loss;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += rule.draw;
        away.points += rule.draw;
      }
    }
    return rows;
  }

  private rankBlock(
    block: string[],
    matches: CountedMatch[],
    rule: ActionStandingsRule,
    globalStats: Map<string, StandingStats>,
    criteria: ActionTiebreaker[],
  ): string[] {
    if (block.length <= 1) return block;
    const [criterion, ...rest] = criteria;
    if (!criterion || criterion === 'sorteio') {
      return [...block].sort((left, right) => left.localeCompare(right));
    }
    const mini =
      criterion === 'confronto-direto'
        ? this.accumulate(
            block,
            matches.filter(
              (match) =>
                !!match.entryAId &&
                !!match.entryBId &&
                block.includes(match.entryAId) &&
                block.includes(match.entryBId),
            ),
            rule,
          )
        : new Map<string, StandingStats>();
    const buckets = new Map<number, string[]>();
    for (const entryId of block) {
      const value = this.criterionValue(criterion, globalStats.get(entryId), mini.get(entryId));
      buckets.set(value, [...(buckets.get(value) ?? []), entryId]);
    }
    if (buckets.size === 1) return this.rankBlock(block, matches, rule, globalStats, rest);
    return [...buckets.entries()]
      .sort(([left], [right]) => right - left)
      .flatMap(([, tied]) => this.rankBlock(tied, matches, rule, globalStats, rest));
  }

  private criterionValue(
    criterion: ActionTiebreaker,
    row = this.emptyStats(),
    mini = this.emptyStats(),
  ): number {
    if (criterion === 'confronto-direto') {
      return mini.points * 1_000 + mini.scoreFor - mini.scoreAgainst;
    }
    if (criterion === 'vitorias') return row.won;
    if (criterion === 'saldo') return row.scoreFor - row.scoreAgainst;
    if (criterion === 'marcados') return row.scoreFor;
    if (criterion === 'sofridos') return -row.scoreAgainst;
    if (criterion === 'fair-play') return -row.disciplinary;
    return 0;
  }

  private async progressKnockout(
    transaction: Prisma.TransactionClient,
    tournament: {
      id: string;
      status: TournamentStatus;
      config: Prisma.JsonValue | null;
      phases: Array<{
        id: string;
        order: number;
        type: PhaseType;
        config: Prisma.JsonValue | null;
        groups: Array<{
          id: string;
          name: string;
          entries: Array<{ entryId: string }>;
        }>;
      }>;
      entries: Array<{
        id: string;
        seed: number | null;
        team: { name: string } | null;
        athlete: { name: string } | null;
      }>;
    },
  ): Promise<void> {
    const knockout = tournament.phases.find((phase) => phase.type === PhaseType.KNOCKOUT);
    if (!knockout) return;
    const config = this.record(tournament.config) ?? {};
    const advancement = this.advancement(config.advancement, tournament.phases, knockout.order);
    const advanced = await transaction.match.findMany({
      where: {
        phaseId: knockout.id,
        id: { startsWith: `${tournament.id}-advanced-r` },
      },
      orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        round: true,
        bracketSlot: true,
        entryAId: true,
        entryBId: true,
        winnerEntryId: true,
        status: true,
        scheduledAt: true,
      },
    });
    if (!advanced.length) {
      await this.createFirstRound(
        transaction,
        tournament,
        knockout.id,
        knockout.order,
        advancement,
      );
      return;
    }

    const rounds = new Map<number, typeof advanced>();
    for (const match of advanced) {
      const round = match.round ?? this.roundFromId(match.id, tournament.id);
      if (!round) continue;
      rounds.set(round, [...(rounds.get(round) ?? []), match]);
    }
    const lastRound = Math.max(0, ...rounds.keys());
    const current = (rounds.get(lastRound) ?? []).sort(
      (left, right) => (left.bracketSlot ?? 0) - (right.bracketSlot ?? 0),
    );
    if (!current.length || current.some((match) => !OFFICIAL_STATUSES.includes(match.status))) {
      return;
    }
    const storedByes = this.progressionByes(config.progressionByes, lastRound);
    const slotOrders = [
      ...new Set([
        ...current.map((match) => match.bracketSlot ?? 0),
        ...Object.keys(storedByes).map(Number),
      ]),
    ]
      .filter((value) => value > 0)
      .sort((left, right) => left - right);
    const winners: string[] = [];
    for (const slot of slotOrders) {
      const match = current.find((item) => item.bracketSlot === slot);
      if (match) {
        if (!match.winnerEntryId) return;
        winners.push(match.winnerEntryId);
      } else if (storedByes[String(slot)]) {
        winners.push(storedByes[String(slot)]);
      }
    }

    if (winners.length <= 1) {
      const thirdPlace = await transaction.match.findUnique({
        where: { id: `${tournament.id}-advanced-third` },
        select: { status: true },
      });
      if (thirdPlace && !OFFICIAL_STATUSES.includes(thirdPlace.status)) return;
      await transaction.tournament.update({
        where: { id: tournament.id },
        data: { status: TournamentStatus.FINISHED },
      });
      return;
    }
    const nextRound = lastRound + 1;
    if (rounds.has(nextRound)) return;
    const pairs = this.sequentialPairs(winners);
    const nextDate = this.nextDate(current.map((match) => match.scheduledAt));
    await this.createRound(transaction, tournament.id, knockout.id, nextRound, pairs, nextDate);
    await this.storeProgressionByes(transaction, tournament.id, config, nextRound, pairs);

    if (
      advancement.thirdPlaceMatch &&
      winners.length === 2 &&
      current.length === 2 &&
      !(await transaction.match.findUnique({
        where: { id: `${tournament.id}-advanced-third` },
        select: { id: true },
      }))
    ) {
      const losers = current
        .map((match) => (match.winnerEntryId === match.entryAId ? match.entryBId : match.entryAId))
        .filter((entryId): entryId is string => Boolean(entryId));
      if (losers.length === 2) {
        await transaction.match.create({
          data: this.matchCreateData(
            `${tournament.id}-advanced-third`,
            knockout.id,
            nextRound,
            null,
            losers[0],
            losers[1],
            nextDate,
          ),
        });
      }
    }
  }

  private async createFirstRound(
    transaction: Prisma.TransactionClient,
    tournament: {
      id: string;
      config: Prisma.JsonValue | null;
      phases: Array<{
        id: string;
        order: number;
        type: PhaseType;
        config: Prisma.JsonValue | null;
        groups: Array<{
          id: string;
          name: string;
          entries: Array<{ entryId: string }>;
        }>;
      }>;
      entries: Array<{
        id: string;
        seed: number | null;
        team: { name: string } | null;
        athlete: { name: string } | null;
      }>;
    },
    knockoutPhaseId: string,
    knockoutOrder: number,
    advancement: AdvancementRule,
  ): Promise<void> {
    const classification = tournament.phases
      .filter((phase) => phase.order < knockoutOrder && phase.type !== PhaseType.KNOCKOUT)
      .at(-1);
    let slots: QualifierSlot[];
    let sourceDates: Array<Date | null> = [];
    if (classification) {
      const matches = await transaction.match.findMany({
        where: { phaseId: classification.id },
        orderBy: { id: 'asc' },
        select: { status: true, scheduledAt: true },
      });
      if (!matches.length || matches.some((match) => !OFFICIAL_STATUSES.includes(match.status))) {
        return;
      }
      sourceDates = matches.map((match) => match.scheduledAt);
      slots = await this.collectQualifiers(transaction, classification, advancement);
    } else {
      slots = tournament.entries.map((entry) => ({
        entryId: entry.id,
        points: 0,
        balance: 0,
        scoreFor: 0,
      }));
    }
    const pairs = this.seedPairs(slots, advancement.crossing);
    if (!pairs.some((pair) => pair.entryBId)) return;
    const date = this.nextDate(sourceDates);
    await this.createRound(transaction, tournament.id, knockoutPhaseId, 1, pairs, date);
    const namesByEntryId = new Map(
      tournament.entries.map((entry) => [entry.id, entry.team?.name ?? entry.athlete?.name ?? '']),
    );
    const byes = Object.fromEntries(
      pairs
        .filter((pair) => !pair.entryBId)
        .map((pair) => [String(pair.order), namesByEntryId.get(pair.entryAId) ?? pair.entryAId]),
    );
    const config = this.record(tournament.config) ?? {};
    await transaction.tournament.update({
      where: { id: tournament.id },
      data: {
        status: TournamentStatus.ONGOING,
        config: this.inputJson(
          {
            ...config,
            byes,
            progressionByes: {
              ...this.record(config.progressionByes),
              '1': Object.fromEntries(
                pairs
                  .filter((pair) => !pair.entryBId)
                  .map((pair) => [String(pair.order), pair.entryAId]),
              ),
            },
          },
          'A progressão da chave',
        ),
      },
    });
  }

  private async collectQualifiers(
    transaction: Prisma.TransactionClient,
    phase: {
      id: string;
      groups: Array<{
        id: string;
        name: string;
        entries: Array<{ entryId: string }>;
      }>;
    },
    advancement: AdvancementRule,
  ): Promise<QualifierSlot[]> {
    const standings = await transaction.phaseStanding.findMany({
      where: { phaseId: phase.id },
      select: { entryId: true, rank: true, points: true, scoreFor: true, scoreAgainst: true },
    });
    const byEntry = new Map(standings.map((standing) => [standing.entryId, standing]));
    if (!phase.groups.length) {
      return standings
        .filter((standing) => (standing.rank ?? Number.MAX_SAFE_INTEGER) <= advancement.perGroup)
        .sort(
          (left, right) =>
            (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
            left.entryId.localeCompare(right.entryId),
        )
        .map((standing) => this.qualifierSlot(standing));
    }
    const direct: QualifierSlot[] = [];
    for (let position = 1; position <= advancement.perGroup; position += 1) {
      for (const group of phase.groups) {
        const standing = group.entries
          .map((entry) => byEntry.get(entry.entryId))
          .find((item) => item?.rank === position);
        if (standing) direct.push(this.qualifierSlot(standing));
      }
    }
    const thirds =
      advancement.bestThirds > 0
        ? phase.groups
            .map((group) =>
              group.entries
                .map((entry) => byEntry.get(entry.entryId))
                .find((item) => item?.rank === advancement.perGroup + 1),
            )
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((standing) => this.qualifierSlot(standing))
            .sort(
              (left, right) =>
                right.points - left.points ||
                right.balance - left.balance ||
                right.scoreFor - left.scoreFor ||
                left.entryId.localeCompare(right.entryId),
            )
            .slice(0, advancement.bestThirds)
        : [];
    return [...direct, ...thirds];
  }

  private qualifierSlot(standing: {
    entryId: string;
    points: number;
    scoreFor: number;
    scoreAgainst: number;
  }): QualifierSlot {
    return {
      entryId: standing.entryId,
      points: standing.points,
      balance: standing.scoreFor - standing.scoreAgainst,
      scoreFor: standing.scoreFor,
    };
  }

  private seedPairs(slots: QualifierSlot[], crossing: AdvancementRule['crossing']): BracketPair[] {
    const entries = slots.map((slot) => slot.entryId);
    if (entries.length < 2) return [];
    if (crossing === 'sequencial') return this.sequentialPairs(entries);
    let size = 1;
    while (size < entries.length) size *= 2;
    size = Math.max(2, size);
    const seeded: Array<string | null> = [
      ...entries,
      ...Array.from({ length: size - entries.length }, () => null),
    ];
    const pairs: BracketPair[] = [];
    for (let index = 0; index < size / 2; index += 1) {
      const entryAId = seeded[index];
      if (!entryAId) continue;
      pairs.push({
        order: pairs.length + 1,
        entryAId,
        entryBId: seeded[size - 1 - index],
      });
    }
    return pairs;
  }

  private sequentialPairs(entries: string[]): BracketPair[] {
    const pairs: BracketPair[] = [];
    for (let index = 0; index < entries.length; index += 2) {
      pairs.push({
        order: pairs.length + 1,
        entryAId: entries[index],
        entryBId: entries[index + 1] ?? null,
      });
    }
    return pairs;
  }

  private async createRound(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    phaseId: string,
    round: number,
    pairs: BracketPair[],
    scheduledAt: Date,
  ): Promise<void> {
    for (const pair of pairs.filter((item) => item.entryBId)) {
      await transaction.match.create({
        data: this.matchCreateData(
          `${tournamentId}-advanced-r${round}-${pair.order}`,
          phaseId,
          round,
          pair.order,
          pair.entryAId,
          pair.entryBId!,
          scheduledAt,
        ),
      });
    }
    await transaction.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.ONGOING },
    });
  }

  private matchCreateData(
    id: string,
    phaseId: string,
    round: number,
    bracketSlot: number | null,
    entryAId: string,
    entryBId: string,
    scheduledAt: Date,
  ): Prisma.MatchUncheckedCreateInput {
    return {
      id,
      phaseId,
      round,
      bracketSlot,
      entryAId,
      entryBId,
      status: MatchStatus.SCHEDULED,
      scheduledAt,
      venue: 'A definir',
      scoreA: 0,
      scoreB: 0,
      currentPeriod: 1,
      clockSeconds: 0,
      paused: true,
      periodScoreA: 0,
      periodScoreB: 0,
    };
  }

  private async storeProgressionByes(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    config: Record<string, unknown>,
    round: number,
    pairs: BracketPair[],
  ): Promise<void> {
    const progressionByes = this.record(config.progressionByes) ?? {};
    await transaction.tournament.update({
      where: { id: tournamentId },
      data: {
        config: this.inputJson(
          {
            ...config,
            progressionByes: {
              ...progressionByes,
              [String(round)]: Object.fromEntries(
                pairs
                  .filter((pair) => !pair.entryBId)
                  .map((pair) => [String(pair.order), pair.entryAId]),
              ),
            },
          },
          'A progressão da chave',
        ),
      },
    });
  }

  private advancement(
    value: unknown,
    phases: Array<{ order: number; type: PhaseType; config: Prisma.JsonValue | null }>,
    knockoutOrder: number,
  ): AdvancementRule {
    const stored = this.record(value);
    const groupPhase = phases
      .filter((phase) => phase.order < knockoutOrder && phase.type === PhaseType.GROUP)
      .at(-1);
    const groupConfig = this.record(groupPhase?.config);
    return {
      perGroup:
        this.positiveInteger(stored?.perGroup) ??
        this.positiveInteger(groupConfig?.qualifiers) ??
        2,
      bestThirds: this.nonNegativeInteger(stored?.bestThirds) ?? 0,
      crossing: stored?.crossing === 'sequencial' ? 'sequencial' : 'padrao',
      thirdPlaceMatch: stored?.thirdPlaceMatch === true,
    };
  }

  private progressionByes(value: unknown, round: number): Record<string, string> {
    const all = this.record(value);
    const current = this.record(all?.[String(round)]);
    if (!current) return {};
    return Object.fromEntries(
      Object.entries(current).filter(
        (entry): entry is [string, string] =>
          /^\d+$/.test(entry[0]) && typeof entry[1] === 'string' && !!entry[1],
      ),
    );
  }

  private roundFromId(matchId: string, tournamentId: string): number | null {
    const escaped = tournamentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = new RegExp(`^${escaped}-advanced-r(\\d+)-`).exec(matchId);
    return result ? Number(result[1]) : null;
  }

  private nextDate(values: Array<Date | null>): Date {
    const timestamps = values.flatMap((value) => (value ? [value.getTime()] : []));
    const date = new Date(timestamps.length ? Math.max(...timestamps) : Date.now());
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(18, 0, 0, 0);
    return date;
  }

  private fairPlayPoints(value: Prisma.JsonValue | null): number {
    const metadata = this.record(value);
    const points = metadata?.fairPlayPoints;
    return typeof points === 'number' && Number.isFinite(points) && points >= 0 ? points : 0;
  }

  private emptyStats(): StandingStats {
    return {
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      scoreFor: 0,
      scoreAgainst: 0,
      points: 0,
      disciplinary: 0,
    };
  }

  private record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private positiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private nonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
  }

  private inputJson(value: unknown, label: string): Prisma.InputJsonValue {
    try {
      return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
    } catch {
      throw new Error(`${label} não pôde ser serializada.`);
    }
  }
}
