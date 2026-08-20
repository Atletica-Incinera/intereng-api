import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ThrottleAuth } from './guards/auth-throttler.config';
import { AllowPasswordChangePending } from './decorators/allow-password-change-pending.decorator';
import { Cookies } from '../common/decorators/cookies.decorator';
import { AuthResponse, LogoutResponse, MeResponse } from './interfaces/auth-response.interface';
import { AuthCookieService, REFRESH_TOKEN_COOKIE_NAME } from './services/auth-cookie.service';

interface RequestWithUser extends Request {
  user?: {
    id: string;
    isSuperAdmin: boolean;
    mustChangePassword: boolean;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  /**
   * Tetos por janela de cinco minutos.
   *
   * 10 por IP+e-mail: quem erra a senha dez vezes seguidas em cinco minutos já
   * precisa de ajuda humana, e a trava expira sozinha dentro do intervalo de um
   * jogo. 100 por IP: a senha de convite é a mesma para todo o staff, então
   * quem a descobre só precisa achar um e-mail válido — o teto por origem é o
   * que impede varrer e-mails —, mas ainda cabe uma sala inteira de mesários
   * entrando pelo mesmo NAT do campus, já que cada pessoa faz um ou dois logins
   * por turno.
   */
  @Post('login')
  @HttpCode(200)
  @ThrottleAuth({ porIdentidade: 10, porOrigem: 100 })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(loginDto);
    this.authCookieService.setRefreshToken(response, session.refreshToken);
    return session.auth;
  }

  /**
   * O token de acesso vive 15 minutos, então uma sessão legítima renova umas
   * poucas vezes por janela — 30 cobre abas duplicadas e reconexões. O teto por
   * origem é o mais alto das três rotas porque renovação é automática: dezenas
   * de abas atrás do mesmo NAT renovam sozinhas, sem ninguém digitar nada.
   */
  @Post('refresh')
  @HttpCode(200)
  @ThrottleAuth({ porIdentidade: 30, porOrigem: 300 })
  async refresh(
    @Cookies(REFRESH_TOKEN_COOKIE_NAME) refreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException('Token de atualização não fornecido.');
    }

    const session = await this.authService.refresh(refreshToken);
    this.authCookieService.setRefreshToken(response, session.refreshToken);
    return session.auth;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Cookies(REFRESH_TOKEN_COOKIE_NAME) refreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    try {
      await this.authService.logout(refreshToken);
    } finally {
      this.authCookieService.clearRefreshToken(response);
    }

    return { message: 'Logout realizado com sucesso.' };
  }

  /**
   * Troca a senha da própria conta.
   *
   * Liberada para quem ainda não trocou a senha inicial — é justamente a única
   * rota que essa pessoa alcança. Devolve uma sessão nova porque a troca revoga
   * todas as anteriores, inclusive a de quem está pedindo.
   */
  @Post('change-password')
  @HttpCode(200)
  // Trocar a senha é ato deliberado e raro: 5 por sessão em cinco minutos já
  // cobre errar a senha atual algumas vezes, e o teto por origem segura quem
  // tentaria adivinhar a senha atual de outra conta com um token roubado.
  @ThrottleAuth({ porIdentidade: 5, porOrigem: 30 })
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  async changePassword(
    @Req() request: RequestWithUser,
    @Body() changePasswordDto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    if (!request.user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    const session = await this.authService.changePassword(request.user.id, changePasswordDto);
    this.authCookieService.setRefreshToken(response, session.refreshToken);
    return session.auth;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  async me(@Req() request: RequestWithUser): Promise<MeResponse> {
    if (!request.user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return this.authService.getMe(request.user.id);
  }
}
