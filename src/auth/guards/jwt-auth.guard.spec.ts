import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, type JwtPayload } from '../auth.service';
import { ALLOW_PASSWORD_CHANGE_PENDING_KEY } from '../decorators/allow-password-change-pending.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const payload: JwtPayload = {
    sub: '1',
    email: 'nova@example.com',
    isSuperAdmin: false,
    jti: 'jti-1',
    mustChangePassword: true,
  };

  function contextWith(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  function guardWith(allowPending: boolean, verified: JwtPayload = payload) {
    const authService = { verifyAccessToken: jest.fn().mockReturnValue(verified) };
    const reflector = {
      getAllAndOverride: jest.fn((key: string) =>
        key === ALLOW_PASSWORD_CHANGE_PENDING_KEY ? allowPending : undefined,
      ),
    };
    return new JwtAuthGuard(
      authService as unknown as AuthService,
      reflector as unknown as Reflector,
    );
  }

  it('refuses a pending account with 403, not 401', () => {
    const request = { headers: { authorization: 'Bearer token' } };

    // 401 faria o app tratar como sessão expirada e devolver a pessoa ao login,
    // que é exatamente o laço que a troca obrigatória precisa evitar.
    expect(() => guardWith(false).canActivate(contextWith(request))).toThrow(ForbiddenException);
  });

  it('lets a pending account reach the routes marked as allowed', () => {
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer token' } };

    expect(guardWith(true).canActivate(contextWith(request))).toBe(true);
    expect(request.user).toEqual({ id: '1', isSuperAdmin: false, mustChangePassword: true });
  });

  it('lets a settled account through', () => {
    const request: Record<string, unknown> = { headers: { authorization: 'Bearer token' } };
    const guard = guardWith(false, { ...payload, mustChangePassword: false });

    expect(guard.canActivate(contextWith(request))).toBe(true);
  });

  it('still answers 401 when the header is missing', () => {
    expect(() => guardWith(false).canActivate(contextWith({ headers: {} }))).toThrow(
      UnauthorizedException,
    );
  });
});
