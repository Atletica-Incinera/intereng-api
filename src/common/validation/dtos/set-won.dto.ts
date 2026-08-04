import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SetWonDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  setNumber: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsHome: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsAway: number;
}
