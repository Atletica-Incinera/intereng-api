import { Team, Athlete } from '@prisma/client';
import { TeamResponseDto } from './dto/team-response.dto';
import { AthleteResponseDto } from './dto/athlete-response.dto';
import { decryptDocument } from './security.utils';

/**
 * Maps a database Team entity to its corresponding TeamResponseDto.
 *
 * @param team The Team database entity.
 * @returns The structured TeamResponseDto.
 */
export function toTeamResponseDto(team: Team): TeamResponseDto {
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.createdAt,
  };
}

/**
 * Maps a database Athlete entity to its corresponding AthleteResponseDto.
 * Performs PII decryption. Masking is handled at the presentation/interceptor layer.
 *
 * @param athlete The Athlete database entity.
 * @returns The structured AthleteResponseDto.
 */
export function toAthleteResponseDto(athlete: Athlete): AthleteResponseDto {
  const decrypted = decryptDocument(athlete.document);

  return {
    id: athlete.id,
    name: athlete.name,
    document: decrypted,
    birthDate: athlete.birthDate,
    email: athlete.email,
    createdAt: athlete.createdAt,
  };
}
