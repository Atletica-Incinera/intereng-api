import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ConfigService } from '../../common/config/config.service';

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

@Injectable()
export class AuthCookieService {
  constructor(private readonly configService: ConfigService) {}

  setRefreshToken(response: Response, refreshToken: string): void {
    response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      ...this.baseOptions,
      maxAge: this.configService.jwtRefreshTtlSeconds * 1000,
    });
  }

  clearRefreshToken(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, this.baseOptions);
  }

  private get baseOptions(): CookieOptions {
    const sameSite = this.configService.cookieSameSite;
    const secure = this.configService.cookieSecure;

    if (sameSite === 'none' && !secure) {
      throw new Error('COOKIE_SECURE deve ser true quando COOKIE_SAME_SITE for none.');
    }

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain: this.configService.cookieDomain,
      path: this.configService.cookiePath,
    };
  }
}
