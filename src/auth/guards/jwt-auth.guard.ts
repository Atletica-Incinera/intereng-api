import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService, type JwtPayload } from '../auth.service';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator';

type RequestUser = {
  id: string;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
};

/**
 * Guard that enforces JWT authentication on routes.
 * Extracts the access token from the Authorization header and verifies it.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Resolves whether the current request is authorized to proceed.
   * Ensures the request contains a valid Bearer JWT access token and binds user details to the request.
   *
   * @param context Execution context containing request details.
   * @returns true if authentication is successful.
   * @throws UnauthorizedException if authorization header is missing, incorrectly formatted, or the token is invalid/expired.
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Token de acesso não fornecido.');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Formato do token de acesso inválido.');
    }

    let payload: JwtPayload;
    try {
      payload = this.authService.verifyAccessToken(token);
    } catch (_error) {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }

    request.user = {
      id: payload.sub,
      isSuperAdmin: payload.isSuperAdmin,
      mustChangePassword: payload.mustChangePassword === true,
    };

    // Fora do `try` de propósito: dentro dele a recusa viraria 401, e o app
    // trataria como sessão expirada — derrubando a pessoa para o login em vez
    // de levá-la à troca de senha.
    if (request.user.mustChangePassword && !this.allowsPasswordChangePending(context)) {
      throw new ForbiddenException('É necessário trocar a senha inicial antes de usar o sistema.');
    }

    return true;
  }

  private allowsPasswordChangePending(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_PENDING_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
