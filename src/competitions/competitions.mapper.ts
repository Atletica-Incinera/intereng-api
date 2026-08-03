import { Competition } from '@prisma/client';
import { CompetitionResponseDto } from './dto/competition-response.dto';

/**
 * Maps a Prisma Competition model to a CompetitionResponseDto.
 * Excludes any internal or unwanted fields to prevent information leaks.
 *
 * @param competition The database Competition entity.
 * @returns The mapped CompetitionResponseDto.
 */
export function toCompetitionResponseDto(
  competition: Competition,
): CompetitionResponseDto {
  return {
    id: competition.id,
    name: competition.name,
    slug: competition.slug,
    createdAt: competition.createdAt,
    updatedAt: competition.updatedAt,
  };
}
