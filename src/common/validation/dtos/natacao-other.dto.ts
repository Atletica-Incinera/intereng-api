import { IsInt, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class NatacaoOtherDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  timeSeconds: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  lane: number;
}
