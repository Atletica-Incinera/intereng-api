import { TournamentEntry, Team, Athlete } from '@prisma/client';

export type TournamentEntryWithRelations = TournamentEntry & {
  team: Team | null;
  athlete: Athlete | null;
};

/**
 * Maps a TournamentEntry entity along with its loaded relations to the standard response DTO format.
 *
 * @param entry The tournament entry database entity with team and athlete relations
 * @returns Cleaned response DTO ready for client consumption
 */
export function toTournamentEntryResponseDto(entry: TournamentEntryWithRelations) {
  return {
    id: entry.id,
    tournamentId: entry.tournamentId,
    teamId: entry.teamId,
    teamName: entry.team ? entry.team.name : null,
    athleteId: entry.athleteId,
    athleteName: entry.athlete ? entry.athlete.name : null,
    seed: entry.seed,
    createdAt: entry.createdAt,
  };
}
