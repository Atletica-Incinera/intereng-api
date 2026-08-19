import { CanActivate, ExecutionContext, GoneException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

const LEGACY_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const API_PREFIX = '/api/v1';

const CANONICAL_MUTATION_ROUTES: ReadonlyArray<{
  method: string;
  path: RegExp;
}> = [
  { method: 'POST', path: /^\/auth\/(?:login|refresh|logout|change-password)$/ },
  { method: 'POST', path: /^\/editions\/[^/]+\/actions$/ },
  { method: 'POST', path: /^\/teams\/[^/]+\/logo-upload-url$/ },
  // Único sobrevivente do CRUD granular de competições, de propósito: o
  // pipeline de ações não consegue criar a primeira competição de um sistema
  // vazio (resolve a edição "active" antes de rodar qualquer ação). O resto
  // de `/competitions` continua bloqueado — 410, como o guard sempre fez.
  { method: 'POST', path: /^\/competitions\/bootstrap$/ },
];

function normalizeRequestPath(request: Request): string {
  const rawPath = request.originalUrl || request.url || request.path || '/';
  const pathWithoutQuery = rawPath.split(/[?#]/, 1)[0] || '/';
  const normalizedSlashes = `/${pathWithoutQuery}`.replace(/\/{2,}/g, '/');
  const withoutApiPrefix = normalizedSlashes.replace(new RegExp(`^${API_PREFIX}(?=/|$)`), '');
  const withoutTrailingSlash = withoutApiPrefix.replace(/\/+$/, '');

  return withoutTrailingSlash || '/';
}

@Injectable()
export class LegacyMutationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    if (!LEGACY_MUTATION_METHODS.has(method)) {
      return true;
    }

    const path = normalizeRequestPath(request);
    const isCanonicalMutation = CANONICAL_MUTATION_ROUTES.some(
      (route) => route.method === method && route.path.test(path),
    );

    if (isCanonicalMutation) {
      return true;
    }

    throw new GoneException(
      'Esta rota de mutação foi descontinuada. Use o endpoint canônico de ações da edição.',
    );
  }
}
