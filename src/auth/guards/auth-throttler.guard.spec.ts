import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerOptions, ThrottlerStorage } from '@nestjs/throttler';
import {
  IDENTITY_THROTTLER,
  ORIGIN_THROTTLER,
  ThrottleAuth,
  authThrottlerOptions,
} from './auth-throttler.config';
import { AuthThrottlerGuard } from './auth-throttler.guard';

class RotaFake {
  @ThrottleAuth({ porIdentidade: 10, porOrigem: 100 })
  limitada(): void {}

  livre(): void {}
}

class GuardExposto extends AuthThrottlerGuard {
  pularia(context: ExecutionContext): Promise<boolean> {
    return this.shouldSkip(context);
  }
}

describe('AuthThrottlerGuard', () => {
  const { throttlers } = authThrottlerOptions as { throttlers: ThrottlerOptions[] };
  const byName = (name: string) => {
    const throttler = throttlers.find((candidate) => candidate.name === name);
    if (!throttler?.getTracker) throw new Error(`throttler ${name} sem getTracker`);
    return throttler.getTracker;
  };
  const identityTracker = byName(IDENTITY_THROTTLER);
  const originTracker = byName(ORIGIN_THROTTLER);
  const context = {} as ExecutionContext;

  function loginRequest(email: string, forwardedFor: string) {
    return {
      method: 'POST',
      headers: { 'x-forwarded-for': forwardedFor },
      // O IP visto pelo Express é sempre o do nginx; é exatamente esse valor
      // que não pode virar a chave do throttler.
      ip: '127.0.0.1',
      body: { email, password: 'seja-o-que-for' },
    };
  }

  it('usa o IP real do cliente, e não o do proxy', async () => {
    const tracker = await originTracker(loginRequest('mesa@intereng.br', '198.51.100.7'), context);

    expect(tracker).toBe('198.51.100.7');
  });

  it('ignora o X-Forwarded-For forjado pelo cliente', async () => {
    // O nginx anexa o peer imediato ao fim do header: o que o atacante escreveu
    // fica à esquerda, e é a última entrada que vale.
    const forjado = await originTracker(
      loginRequest('mesa@intereng.br', '9.9.9.9, 198.51.100.7'),
      context,
    );

    expect(forjado).toBe('198.51.100.7');
  });

  it('separa o balde por e-mail para não travar a sala inteira atrás do mesmo NAT', async () => {
    const primeira = await identityTracker(
      loginRequest('ana@intereng.br', '198.51.100.7'),
      context,
    );
    const segunda = await identityTracker(loginRequest('bia@intereng.br', '198.51.100.7'), context);

    expect(primeira).not.toBe(segunda);
    expect(primeira).toContain('198.51.100.7');
    expect(primeira).toContain('ana@intereng.br');
  });

  it('normaliza o e-mail — caixa alta não é outra conta', async () => {
    const cru = await identityTracker(loginRequest(' ANA@intereng.br ', '198.51.100.7'), context);
    const normalizado = await identityTracker(
      loginRequest('ana@intereng.br', '198.51.100.7'),
      context,
    );

    expect(cru).toBe(normalizado);
  });

  it('junta no mesmo balde por origem quem varre e-mails do mesmo IP', async () => {
    const primeira = await originTracker(loginRequest('ana@intereng.br', '198.51.100.7'), context);
    const segunda = await originTracker(loginRequest('bia@intereng.br', '198.51.100.7'), context);

    expect(primeira).toBe(segunda);
  });

  it('identifica a troca de senha pelo token, sem guardar o token na chave', async () => {
    const tracker = await identityTracker(
      {
        method: 'POST',
        headers: { authorization: 'Bearer token-secreto', 'x-forwarded-for': '198.51.100.7' },
        body: {},
      },
      context,
    );

    expect(tracker).toContain('198.51.100.7|token:');
    expect(tracker).not.toContain('token-secreto');
  });

  it('identifica o refresh pela sessão do cookie', async () => {
    const tracker = await identityTracker(
      {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.7' },
        cookies: { refreshToken: 'cookie-secreto' },
      },
      context,
    );

    expect(tracker).toContain('198.51.100.7|sessao:');
    expect(tracker).not.toContain('cookie-secreto');
  });

  it('só age nas rotas marcadas — o resto da API segue sem limite', async () => {
    const guard = new GuardExposto(authThrottlerOptions, {} as ThrottlerStorage, new Reflector());
    const contextOf = (handler: () => void) =>
      ({ getHandler: () => handler, getClass: () => RotaFake }) as unknown as ExecutionContext;

    await expect(guard.pularia(contextOf(RotaFake.prototype.limitada))).resolves.toBe(false);
    await expect(guard.pularia(contextOf(RotaFake.prototype.livre))).resolves.toBe(true);
  });
});
