import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @IsNotEmpty({ message: 'email é obrigatório' })
  email!: string;

  @IsString({ message: 'password deve ser uma string' })
  @IsNotEmpty({ message: 'password é obrigatório' })
  password!: string;
}
