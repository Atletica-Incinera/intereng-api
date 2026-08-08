import { IsString, IsOptional } from 'class-validator';

export class EditionRosterQueryDto {
  @IsString()
  @IsOptional()
  disciplineId?: string;

  @IsString()
  @IsOptional()
  teamId?: string;
}
