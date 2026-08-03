import { Competition } from '@prisma/client';
import { toCompetitionResponseDto } from './competitions.mapper';

describe('CompetitionsMapper', () => {
  it('should map Competition entity to CompetitionResponseDto correctly', () => {
    const rawCompetition: Competition = {
      id: 'comp_123',
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
      createdAt: new Date('2026-08-03T12:00:00Z'),
      updatedAt: new Date('2026-08-03T13:00:00Z'),
    };

    const mapped = toCompetitionResponseDto(rawCompetition);

    expect(mapped).toEqual({
      id: 'comp_123',
      name: 'Jogos de Engenharia',
      slug: 'jogos-de-engenharia',
      createdAt: rawCompetition.createdAt,
      updatedAt: rawCompetition.updatedAt,
    });
  });
});
