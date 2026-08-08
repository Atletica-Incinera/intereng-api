import { IsInt, IsArray, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GroupLeaguePhaseConfigDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  advanceCount: number;

  @IsArray()
  @IsString({ each: true })
  tiebreakers: string[];
}
