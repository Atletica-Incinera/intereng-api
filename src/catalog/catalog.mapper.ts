import { Team, Athlete } from '@prisma/client';
import { TeamResponseDto } from './dto/team-response.dto';
import { AthleteResponseDto } from './dto/athlete-response.dto';
import { decryptDocument, maskDocument } from './security.utils';

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
 * Performs PII decryption and determines whether the document should be returned
 * in plaintext or masked based on the requesting user's administrative privileges.
 *
 * @param athlete The Athlete database entity.
 * @param isAdmin Boolean flag indicating if the requesting user has administrative access.
 * @returns The structured AthleteResponseDto.
 */
export function toAthleteResponseDto(athlete: Athlete, isAdmin: boolean): AthleteResponseDto {
  const decrypted = decryptDocument(athlete.document);
  const document = isAdmin ? decrypted : maskDocument(decrypted);

  return {
    id: athlete.id,
    name: athlete.name,
    document,
    birthDate: athlete.birthDate,
    email: athlete.email,
    createdAt: athlete.createdAt,
  };
}
