import { IsObject, IsOptional } from 'class-validator';

export class UpdateEditionDisciplineDto {
  @IsObject({ message: 'A configuração deve ser um objeto JSON.' })
  @IsOptional()
  config?: Record<string, any>;
}
