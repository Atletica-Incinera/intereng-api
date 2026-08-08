import { Tournament, EditionDiscipline } from '@prisma/client';

export type TournamentWithRelations = Tournament & {
  editionDiscipline: EditionDiscipline;
};

/**
 * Maps a Tournament entity along with its loaded EditionDiscipline relation
 * to the standard response DTO format.
 *
 * @param tournament The tournament database entity with editionDiscipline relation
 * @returns Cleaned response DTO ready for client consumption
 */
export function toTournamentResponseDto(tournament: TournamentWithRelations) {
  return {
    id: tournament.id,
    editionId: tournament.editionDiscipline.editionId,
    disciplineId: tournament.editionDiscipline.disciplineId,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
  };
}
