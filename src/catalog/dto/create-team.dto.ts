import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateTeamDto {
  @IsString({ message: 'O nome da equipe deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da equipe é obrigatório.' })
  name!: string;

  @IsString({ message: 'O slug da equipe deve ser uma string.' })
  @IsNotEmpty({ message: 'O slug da equipe é obrigatório.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug!: string;
}
