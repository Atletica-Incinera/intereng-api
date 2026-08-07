import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { CatalogSecurityService } from '../catalog-security.service';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Guard that restricts access to catalog management operations.
 * Allows access only to SuperAdmins or users with the EDITION_ADMIN role.
 */
@Injectable()
export class CanManageCatalogGuard implements CanActivate {
  constructor(private readonly security: CatalogSecurityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado.');
    }

    const isAdmin = await this.security.checkIsAdmin(user.id, user.isSuperAdmin);
    if (!isAdmin) {
      throw new ForbiddenException(
        'Acesso negado. Apenas EDITION_ADMIN ou SuperAdmin podem gerenciar o catálogo.',
      );
    }

    return true;
  }
}
