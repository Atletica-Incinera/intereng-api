import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class CreateTournamentEntryDto {
  @IsString({ message: 'O campo teamId deve ser uma string.' })
  @IsOptional()
  teamId?: string | null;

  @IsString({ message: 'O campo athleteId deve ser uma string.' })
  @IsOptional()
  athleteId?: string | null;

  @IsInt({ message: 'O campo seed deve ser um número inteiro.' })
  @Min(1, { message: 'O seed deve ser maior ou igual a 1.' })
  @IsOptional()
  seed?: number | null;
}
