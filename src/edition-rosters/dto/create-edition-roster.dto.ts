import { IsString, IsNotEmpty, IsOptional, IsInt, IsPositive } from 'class-validator';

export class CreateEditionRosterDto {
  @IsString()
  @IsNotEmpty()
  disciplineId: string;

  @IsString()
  @IsNotEmpty()
  athleteId: string;

  @IsString()
  @IsNotEmpty()
  teamId: string;

  @IsInt()
  @IsPositive()
  @IsOptional()
  jerseyNumber?: number | null;
}
