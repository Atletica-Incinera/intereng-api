import { HttpException, HttpStatus } from '@nestjs/common';
import { SseConnectionLimiter } from './sse-connection-limiter.service';

describe('SseConnectionLimiter', () => {
  const originalEnv = { ...process.env };

  function limiterWith(limits: { global: number; porIp: number; porConta: number }) {
    process.env.REALTIME_SSE_MAX_GLOBAL = String(limits.global);
    process.env.REALTIME_SSE_MAX_PER_IP = String(limits.porIp);
    process.env.REALTIME_SSE_MAX_PER_ACCOUNT = String(limits.porConta);
    return new SseConnectionLimiter();
  }

  function requestFrom(ip: string) {
    return { headers: { 'x-forwarded-for': `203.0.113.9, ${ip}` }, ip: '10.0.0.1' };
  }

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('conta cada conexão e devolve a vaga na liberação', () => {
    const limiter = limiterWith({ global: 10, porIp: 10, porConta: 10 });

    const primeira = limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    const segunda = limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    expect(limiter.activeConnections).toBe(2);

    primeira();
    segunda();
    expect(limiter.activeConnections).toBe(0);
    expect(limiter.activeConnectionsFor('ip:198.51.100.7')).toBe(0);
  });

  it('ignora liberação repetida — finalize e close chegam os dois', () => {
    const limiter = limiterWith({ global: 10, porIp: 10, porConta: 10 });

    const release = limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    release();
    release();

    expect(limiter.activeConnections).toBe(0);
    // Sem a trava de idempotência o contador ficaria negativo e o teto viraria
    // infinito para todo mundo.
    expect(limiter.acquireForOrigin(requestFrom('198.51.100.7'))).toBeDefined();
    expect(limiter.activeConnections).toBe(1);
  });

  it('recusa com 429 quando a origem estoura o teto', () => {
    const limiter = limiterWith({ global: 10, porIp: 2, porConta: 10 });
    limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    limiter.acquireForOrigin(requestFrom('198.51.100.7'));

    let recusa: unknown;
    try {
      limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    } catch (error) {
      recusa = error;
    }

    expect(recusa).toBeInstanceOf(HttpException);
    expect((recusa as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect((recusa as HttpException).message).toContain('conexões de tempo real demais');
  });

  it('não deixa uma origem derrubar as outras', () => {
    const limiter = limiterWith({ global: 10, porIp: 1, porConta: 10 });
    limiter.acquireForOrigin(requestFrom('198.51.100.7'));

    expect(() => limiter.acquireForOrigin(requestFrom('198.51.100.8'))).not.toThrow();
  });

  it('recusa com 429 quando o processo estoura o teto global', () => {
    const limiter = limiterWith({ global: 2, porIp: 50, porConta: 50 });
    limiter.acquireForOrigin(requestFrom('198.51.100.7'));
    limiter.acquireForAccount('conta-1');

    expect(() => limiter.acquireForAccount('conta-2')).toThrow(/limite de conexões simultâneas/);
  });

  it('conta o canal privado por conta, não por endereço', () => {
    const limiter = limiterWith({ global: 10, porIp: 10, porConta: 2 });
    limiter.acquireForAccount('conta-1');
    limiter.acquireForAccount('conta-1');

    expect(() => limiter.acquireForAccount('conta-1')).toThrow(HttpException);
    expect(() => limiter.acquireForAccount('conta-2')).not.toThrow();
  });
});
