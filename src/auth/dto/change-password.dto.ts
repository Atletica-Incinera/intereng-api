import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { MAX_PASSWORD_BYTES, MIN_CHOSEN_PASSWORD_LENGTH } from '../../common/config/env';

export class ChangePasswordDto {
  @IsString({ message: 'currentPassword deve ser uma string' })
  @IsNotEmpty({ message: 'currentPassword é obrigatório' })
  currentPassword!: string;

  @IsString({ message: 'newPassword deve ser uma string' })
  @MinLength(MIN_CHOSEN_PASSWORD_LENGTH, {
    message: `newPassword deve ter ao menos ${MIN_CHOSEN_PASSWORD_LENGTH} caracteres`,
  })
  // O bcrypt trunca em silêncio a partir de 72 bytes: recusar é melhor do que
  // aceitar uma senha da qual só o começo vale.
  @MaxLength(MAX_PASSWORD_BYTES, {
    message: `newPassword deve ter no máximo ${MAX_PASSWORD_BYTES} caracteres`,
  })
  newPassword!: string;
}
