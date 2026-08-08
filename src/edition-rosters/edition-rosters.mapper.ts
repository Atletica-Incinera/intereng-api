import {
  EditionRoster,
  Athlete,
  Team,
  CompetitionEdition,
  Discipline,
  EditionDiscipline,
} from '@prisma/client';

export type EditionRosterWithRelations = EditionRoster & {
  athlete: Athlete;
  team: Team | null;
  editionDiscipline: EditionDiscipline & {
    edition: CompetitionEdition;
    discipline: Discipline;
  };
};

/**
 * Maps an EditionRoster entity along with its loaded relations to the standard response DTO format.
 *
 * @param roster The roster database entity with athlete, team, and discipline relations
 * @returns Cleaned response DTO ready for client consumption
 */
export function toRosterResponseDto(roster: EditionRosterWithRelations) {
  return {
    id: roster.id,
    editionId: roster.editionDiscipline.editionId,
    editionName: roster.editionDiscipline.edition.name,
    disciplineId: roster.editionDiscipline.disciplineId,
    disciplineName: roster.editionDiscipline.discipline.name,
    teamId: roster.teamId,
    teamName: roster.team ? roster.team.name : null,
    jerseyNumber: roster.jerseyNumber,
    status: roster.status,
    athlete: {
      id: roster.athlete.id,
      name: roster.athlete.name,
    },
  };
}
