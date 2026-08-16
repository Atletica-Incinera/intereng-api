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
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Cookies } from '../common/decorators/cookies.decorator';
import { AuthResponse, LogoutResponse, MeResponse } from './interfaces/auth-response.interface';
import { AuthCookieService, REFRESH_TOKEN_COOKIE_NAME } from './services/auth-cookie.service';

interface RequestWithUser extends Request {
  user?: {
    id: string;
    isSuperAdmin: boolean;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authCookieService: AuthCookieService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const session = await this.authService.login(loginDto);
    this.authCookieService.setRefreshToken(response, session.refreshToken);
    return session.auth;
  }

  @Post('refresh')
  @HttpCode(200)
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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: RequestWithUser): Promise<MeResponse> {
    if (!request.user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }

    return this.authService.getMe(request.user.id);
  }
}
