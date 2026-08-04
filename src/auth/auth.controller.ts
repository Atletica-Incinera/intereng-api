import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Cookies } from '../common/decorators/cookies.decorator';

const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

interface RequestWithUser extends Request {
  user?: {
    id: string;
    isSuperAdmin: boolean;
  };
}

/**
 * Controller responsible for authentication endpoints including login, refresh, logout, and self user retrieval.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Handles user login by validating credentials and returning access/refresh tokens.
   * Also configures a secure HttpOnly cookie with the refresh token.
   *
   * @param loginDto DTO containing email and password credentials.
   * @param response Express response object used to set the secure refresh token cookie.
   * @returns An object containing access token, refresh token, expiry details, and staff info.
   */
  @Post('login')
  @HttpCode(200)
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(loginDto);

    // Set cookie for refresh token as well, in case frontend prefers cookie-based auth
    response.cookie('refreshToken', result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

    return result;
  }

  /**
   * Refreshes the active access token using a refresh token provided either in the request body
   * or within the request cookies.
   *
   * @param refreshDto DTO optionally containing the refresh token.
   * @param cookieRefreshToken The refresh token extracted from request cookies by the custom decorator.
   * @param response Express response object used to update the secure refresh token cookie.
   * @returns An object containing a new access token, a rotated refresh token, expiry details, and staff info.
   * @throws BadRequestException if no refresh token is provided in either the body or cookies.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Body() refreshDto: RefreshDto,
    @Cookies('refreshToken') cookieRefreshToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = refreshDto.refreshToken || cookieRefreshToken;

    if (!token) {
      throw new BadRequestException('Token de atualização não fornecido.');
    }

    const result = await this.authService.refresh(token);

    response.cookie('refreshToken', result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

    return result;
  }

  /**
   * Logs out the user by clearing the secure refresh token cookie.
   * Requires a valid access token.
   *
   * @param response Express response object used to clear the refresh token cookie.
   * @returns A success message.
   */
  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('refreshToken');
    return { message: 'Logout realizado com sucesso.' };
  }

  /**
   * Retrieves profile details and assigned roles of the currently logged-in staff member.
   * Requires a valid access token.
   *
   * @param request Request object containing the authenticated user.
   * @returns The profile and roles of the authenticated staff member.
   * @throws UnauthorizedException if request context does not contain user metadata.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() request: RequestWithUser) {
    if (!request.user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }
    return this.authService.getMe(request.user.id);
  }
}
