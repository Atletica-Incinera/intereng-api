import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../auth.service';

/**
 * Guard that enforces JWT authentication on routes.
 * Extracts the access token from the Authorization header and verifies it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  /**
   * Resolves whether the current request is authorized to proceed.
   * Ensures the request contains a valid Bearer JWT access token and binds user details to the request.
   *
   * @param context Execution context containing request details.
   * @returns true if authentication is successful.
   * @throws UnauthorizedException if authorization header is missing, incorrectly formatted, or the token is invalid/expired.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string; isSuperAdmin: boolean } }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Token de acesso não fornecido.');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato do token de acesso inválido.');
    }

    try {
      const payload = this.authService.verifyAccessToken(token);
      request.user = {
        id: payload.sub,
        isSuperAdmin: payload.isSuperAdmin,
      };
      return true;
    } catch (_error) {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }
}
