import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { TournamentFormat } from '@prisma/client';

export class UpdateTournamentDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsEnum(TournamentFormat)
  @IsOptional()
  format?: TournamentFormat;
}
