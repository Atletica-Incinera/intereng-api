import { IsDateString, IsInt, IsNotEmpty, IsString, Matches, Max, Min } from 'class-validator';

export class BootstrapCompetitionDto {
  @IsString({ message: 'O nome da competição deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da competição é obrigatório.' })
  name!: string;

  @IsString({ message: 'O slug da competição deve ser uma string.' })
  @IsNotEmpty({ message: 'O slug da competição é obrigatório.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug!: string;

  @IsInt({ message: 'O ano da edição deve ser um número inteiro.' })
  @Min(1900, { message: 'O ano da edição é inválido.' })
  @Max(2200, { message: 'O ano da edição é inválido.' })
  year!: number;

  @IsDateString({}, { message: 'A data de início deve estar no formato AAAA-MM-DD.' })
  start!: string;

  @IsDateString({}, { message: 'A data de encerramento deve estar no formato AAAA-MM-DD.' })
  end!: string;
}
