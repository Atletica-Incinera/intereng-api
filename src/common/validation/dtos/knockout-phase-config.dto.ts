import { IsOptional } from 'class-validator';

export class KnockoutPhaseConfigDto {
  @IsOptional()
  _empty?: boolean;
}
