import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class VolleyballConfigDto {
  @Type(() => Number)
  @IsInt({ message: 'setsToWin deve ser um número inteiro.' })
  @Min(1, { message: 'setsToWin deve ser pelo menos 1.' })
  setsToWin!: number;

  @Type(() => Number)
  @IsInt({ message: 'pointsPerSet deve ser um número inteiro.' })
  @Min(1, { message: 'pointsPerSet deve ser pelo menos 1.' })
  pointsPerSet!: number;
}

export class DefaultDurationConfigDto {
  @Type(() => Number)
  @IsInt({ message: 'matchDurationMinutes deve ser um número inteiro.' })
  @Min(1, { message: 'matchDurationMinutes deve ser pelo menos 1.' })
  matchDurationMinutes!: number;
}
