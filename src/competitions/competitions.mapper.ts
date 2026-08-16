import { Competition, CompetitionEdition } from '@prisma/client';
import { CompetitionResponseDto } from './dto/competition-response.dto';
import { EditionResponseDto } from './dto/edition-response.dto';

/**
 * Maps a Prisma Competition model to a CompetitionResponseDto.
 * Excludes any internal or unwanted fields to prevent information leaks.
 *
 * @param competition The database Competition entity.
 * @returns The mapped CompetitionResponseDto.
 */
export function toCompetitionResponseDto(competition: Competition): CompetitionResponseDto {
  return {
    id: competition.id,
    name: competition.name,
    slug: competition.slug,
    isActive: competition.isActive,
    createdAt: competition.createdAt,
    updatedAt: competition.updatedAt,
  };
}

/**
 * Maps a Prisma CompetitionEdition model to an EditionResponseDto.
 * Excludes any internal or unwanted fields to prevent information leaks.
 *
 * @param edition The database CompetitionEdition entity.
 * @returns The mapped EditionResponseDto.
 */
export function toEditionResponseDto(edition: CompetitionEdition): EditionResponseDto {
  return {
    id: edition.id,
    competitionId: edition.competitionId,
    year: edition.year,
    name: edition.name,
    startDate: edition.startDate,
    endDate: edition.endDate,
    status: edition.status,
    isActive: edition.isActive,
    revision: edition.revision,
    createdAt: edition.createdAt,
    updatedAt: edition.updatedAt,
  };
}
