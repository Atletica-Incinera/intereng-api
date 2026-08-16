import { IsInt, IsNotEmpty, IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { PhaseType } from '@prisma/client';
import { Transform, TransformFnParams } from 'class-transformer';

export class CreatePhaseDto {
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'O identificador da fase deve ser um texto.' })
  @IsNotEmpty({ message: 'O identificador da fase não pode ficar vazio.' })
  @MaxLength(128, { message: 'O identificador da fase deve ter no máximo 128 caracteres.' })
  clientId?: string;

  @IsInt()
  order: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(PhaseType)
  type: PhaseType;

  @IsOptional()
  config?: any;
}
