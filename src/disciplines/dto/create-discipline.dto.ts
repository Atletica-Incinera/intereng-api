import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateDisciplineDto {
  @IsString({ message: 'O nome da modalidade deve ser uma string.' })
  @IsNotEmpty({ message: 'O nome da modalidade é obrigatório.' })
  name!: string;

  @IsString({ message: 'O slug da modalidade deve ser uma string.' })
  @IsNotEmpty({ message: 'O slug da modalidade é obrigatório.' })
  @Matches(/^[a-z0-9-]+$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug!: string;

  @IsBoolean({ message: 'O campo isIndividual deve ser um booleano.' })
  @IsOptional()
  isIndividual?: boolean;

  @IsString({ message: 'A descrição da modalidade deve ser uma string.' })
  @IsOptional()
  description?: string;
}
