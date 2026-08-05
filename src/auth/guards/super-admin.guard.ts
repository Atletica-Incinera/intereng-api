import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    id: string;
    isSuperAdmin: boolean;
  };
}

/**
 * Guard that restricts access only to global SuperAdmins.
 * Requires JwtAuthGuard to be executed first to populate request.user.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    if (user.isSuperAdmin !== true) {
      throw new ForbiddenException('Acesso restrito a SuperAdmins.');
    }

    return true;
  }
}
