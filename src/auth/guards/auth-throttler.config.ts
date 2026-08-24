import { SetMetadata, applyDecorators } from '@nestjs/common';
import { Throttle, type ThrottlerModuleOptions } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { resolveClientIp } from '../../common/guards/client-ip';

/** Marca as rotas em que o throttler atua; sem ela, o guard deixa passar. */
export const AUTH_THROTTLE_KEY = 'auth:throttle';

/** Balde por pessoa: IP + a identidade que a rota carrega. */
export const IDENTITY_THROTTLER = 'identidade';

/** Balde por origem: só o IP, para cortar quem varre identidades. */
export const ORIGIN_THROTTLER = 'origem';

/**
 * Janela de cinco minutos, e bloqueio do mesmo tamanho.
 *
 * Curta o bastante para que um mesário travado no meio de um jogo espere o
 * intervalo, e não o fim do evento; longa o bastante para que força bruta com
 * qualquer taxa útil esbarre no teto.
 */
export const THROTTLE_WINDOW_MILLISECONDS = 5 * 60_000;

function fingerprint(secret: string): string {
  // Só para separar baldes. O valor nunca é comparado nem persistido: guardar
  // token ou cookie em claro dentro da chave do throttler seria um vazamento em
  // troca de nada.
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

/**
 * Identidade que a requisição carrega, na ordem em que as rotas de auth a
 * oferecem: o e-mail no corpo do login, o Bearer da troca de senha e o cookie
 * de sessão do refresh. Sem nenhuma delas, todo mundo cai no mesmo balde — o
 * que é justamente o comportamento desejado para requisição sem credencial.
 */
function requestIdentity(request: Record<string, any>): string {
  const body: unknown = request.body;
  if (body && typeof body === 'object') {
    const email = (body as { email?: unknown }).email;
    if (typeof email === 'string' && email.trim()) {
      return `email:${email.trim().toLowerCase()}`;
    }
  }

  const authorization: unknown = request.headers?.authorization;
  if (typeof authorization === 'string' && authorization.trim()) {
    return `token:${fingerprint(authorization)}`;
  }

  const cookies: unknown = request.cookies;
  if (cookies && typeof cookies === 'object') {
    const refreshToken = (cookies as { refreshToken?: unknown }).refreshToken;
    if (typeof refreshToken === 'string' && refreshToken) {
      return `sessao:${fingerprint(refreshToken)}`;
    }
  }

  return 'anonimo';
}

/**
 * Configuração do throttler.
 *
 * São dois baldes porque um só não resolve o evento: limitar apenas por IP
 * travaria a sala inteira de mesários atrás do mesmo NAT do campus, e limitar
 * apenas por identidade deixaria livre quem varre e-mails para achar uma conta
 * com a senha de convite compartilhada. Cada rota escolhe os tetos em
 * `@ThrottleAuth`, e a chave gerada já é por rota — os contadores de login,
 * refresh e troca de senha não se misturam.
 */
export const authThrottlerOptions: ThrottlerModuleOptions = {
  errorMessage:
    'Tentativas demais em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
  throttlers: [
    {
      name: IDENTITY_THROTTLER,
      ttl: THROTTLE_WINDOW_MILLISECONDS,
      blockDuration: THROTTLE_WINDOW_MILLISECONDS,
      limit: 10,
      getTracker: (request) =>
        `${resolveClientIp(request as Parameters<typeof resolveClientIp>[0])}|${requestIdentity(request)}`,
    },
    {
      name: ORIGIN_THROTTLER,
      ttl: THROTTLE_WINDOW_MILLISECONDS,
      blockDuration: THROTTLE_WINDOW_MILLISECONDS,
      limit: 100,
      getTracker: (request) => resolveClientIp(request as Parameters<typeof resolveClientIp>[0]),
    },
  ],
};

/**
 * Liga o throttler numa rota e declara os dois tetos dela.
 *
 * O guard é global, mas só age onde este decorador aparece: durante o evento,
 * uma trava inesperada em rota de operação custa mais do que a proteção vale.
 */
export function ThrottleAuth(limits: { porIdentidade: number; porOrigem: number }) {
  return applyDecorators(
    SetMetadata(AUTH_THROTTLE_KEY, true),
    Throttle({
      [IDENTITY_THROTTLER]: {
        limit: limits.porIdentidade,
        ttl: THROTTLE_WINDOW_MILLISECONDS,
        blockDuration: THROTTLE_WINDOW_MILLISECONDS,
      },
      [ORIGIN_THROTTLER]: {
        limit: limits.porOrigem,
        ttl: THROTTLE_WINDOW_MILLISECONDS,
        blockDuration: THROTTLE_WINDOW_MILLISECONDS,
      },
    }),
  );
}
