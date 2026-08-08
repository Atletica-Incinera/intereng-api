import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { TournamentFormat } from '@prisma/client';

export class CreateTournamentDto {
  @IsString()
  @IsNotEmpty()
  disciplineId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(TournamentFormat)
  @IsNotEmpty()
  format: TournamentFormat;
}
