import { Match, TournamentEntry, Team, Athlete } from '@prisma/client';

export type MatchWithRelations = Match & {
  entryA?: (TournamentEntry & { team?: Team | null; athlete?: Athlete | null }) | null;
  entryB?: (TournamentEntry & { team?: Team | null; athlete?: Athlete | null }) | null;
};

/**
 * Maps a match record with its database relations into a simplified public response DTO format.
 *
 * This function performs custom mapping of complex domain entities and formatting of dates:
 * - Maps optional entry A and entry B records using the internal helper `mapEntry`.
 * - Transforms the `scheduledAt` timestamp to an ISO-8601 string format (or null if not scheduled).
 *
 * @param match - The match object containing optionally populated relational entities (entryA, entryB).
 * @returns A structured DTO representing the match, suitable for client responses.
 *
 * @privateRemarks
 * The internal helper `mapEntry` unifies team and athlete representations:
 * - Checks if a `team` is associated with the entry, mapping its `name`.
 * - If not a team, checks if an `athlete` is associated, mapping their `name`.
 * - Returns `{ id: string, name: string | null }` or `null` if the entry is absent.
 */
export function toMatchResponseDto(match: MatchWithRelations) {
  const mapEntry = (
    entry?: (TournamentEntry & { team?: Team | null; athlete?: Athlete | null }) | null,
  ) => {
    if (!entry) return null;
    const name = entry.team ? entry.team.name : entry.athlete ? entry.athlete.name : null;
    return {
      id: entry.id,
      name,
    };
  };

  return {
    id: match.id,
    phaseId: match.phaseId,
    groupId: match.groupId,
    round: match.round,
    bracketSlot: match.bracketSlot,
    entryA: mapEntry(match.entryA),
    entryB: mapEntry(match.entryB),
    winnerEntryId: match.winnerEntryId,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    status: match.status,
    scheduledAt: match.scheduledAt ? match.scheduledAt.toISOString() : null,
    venue: match.venue,
    lastEventSequence: match.lastEventSequence,
  };
}
