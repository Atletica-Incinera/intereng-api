import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export class AuthenticatedUser {
  id!: string;
  isSuperAdmin!: boolean;
}

/**
 * Parameter decorator to extract the authenticated user from the request.
 * Automatically verifies that the user object is present in the request (populated by JwtAuthGuard).
 * Throws an UnauthorizedException if the user is not found.
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Usuário não autenticado.');
    }
    return user;
  },
);
