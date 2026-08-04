import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response, CookieOptions } from 'express';
import { CLEAR_COOKIE_KEY } from '../decorators/clear-cookie.decorator';

const REFRESH_TOKEN_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest();

    const clearCookieName = this.reflector.get<string>(
      CLEAR_COOKIE_KEY,
      context.getHandler(),
    );

    if (clearCookieName) {
      response.clearCookie(clearCookieName);
    }

    return next.handle().pipe(
      map((data) => {
        if (data && data.refreshToken) {
          response.cookie('refreshToken', data.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);
        }
        return data;
      }),
    );
  }
}
