import { Competition, CompetitionEdition, EditionStatus } from '@prisma/client';
import { toCompetitionResponseDto, toEditionResponseDto } from './competitions.mapper';

describe('CompetitionsMapper', () => {
  it('should map Competition entity to CompetitionResponseDto correctly', () => {
    const rawCompetition: Competition = {
      id: 'comp_123',
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
      isActive: false,
      createdAt: new Date('2026-08-03T12:00:00Z'),
      updatedAt: new Date('2026-08-03T13:00:00Z'),
    };

    const mapped = toCompetitionResponseDto(rawCompetition);

    expect(mapped).toEqual({
      id: 'comp_123',
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
      isActive: false,
      createdAt: rawCompetition.createdAt,
      updatedAt: rawCompetition.updatedAt,
    });
  });

  it('should map CompetitionEdition entity to EditionResponseDto correctly', () => {
    const rawEdition: CompetitionEdition = {
      id: 'edition_123',
      competitionId: 'comp_123',
      year: 2026,
      name: 'Jogos de Engenharia 2026',
      startDate: new Date('2026-10-12T00:00:00Z'),
      endDate: new Date('2026-10-19T00:00:00Z'),
      status: EditionStatus.PLANNING,
      isActive: false,
      revision: 0,
      createdAt: new Date('2026-08-03T12:00:00Z'),
      updatedAt: new Date('2026-08-03T13:00:00Z'),
    };

    const mapped = toEditionResponseDto(rawEdition);

    expect(mapped).toEqual({
      id: 'edition_123',
      competitionId: 'comp_123',
      year: 2026,
      name: 'Jogos de Engenharia 2026',
      startDate: rawEdition.startDate,
      endDate: rawEdition.endDate,
      status: EditionStatus.PLANNING,
      isActive: false,
      revision: 0,
      createdAt: rawEdition.createdAt,
      updatedAt: rawEdition.updatedAt,
    });
  });
});
