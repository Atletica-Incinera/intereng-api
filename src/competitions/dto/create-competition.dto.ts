import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateCompetitionDto {
  @IsString({ message: 'O nome da competição deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da competição é obrigatório.' })
  name!: string;

  @IsString({ message: 'O slug da competição deve ser uma string.' })
  @IsNotEmpty({ message: 'O slug da competição é obrigatório.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug!: string;
}
