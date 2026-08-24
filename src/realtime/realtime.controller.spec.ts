import { HttpException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, type Subscription } from 'rxjs';
import { RealtimeController } from './realtime.controller';
import type { RealtimeService } from './realtime.service';
import { SseConnectionLimiter } from './sse-connection-limiter.service';

describe('RealtimeController', () => {
  const originalEnv = { ...process.env };
  let teardown: jest.Mock;
  let realtimeService: { normalizeLastEventId: jest.Mock; createStream: jest.Mock };
  // O heartbeat do controller é um `interval` sem fim: assinatura esquecida
  // segura o event loop e trava a suíte.
  const abertas: Subscription[] = [];

  function requestOf(accountId?: string) {
    const closeHandlers: Array<() => void> = [];
    const request = {
      headers: {},
      user: accountId ? { id: accountId } : undefined,
      on: (event: string, handler: () => void) => {
        if (event === 'close') closeHandlers.push(handler);
      },
    };
    return { request: request as unknown as Request & { user?: { id: string } }, closeHandlers };
  }

  function controllerWith(porConta: number) {
    process.env.REALTIME_SSE_MAX_GLOBAL = '10';
    process.env.REALTIME_SSE_MAX_PER_ACCOUNT = String(porConta);
    const limiter = new SseConnectionLimiter();
    const controller = new RealtimeController(
      realtimeService as unknown as RealtimeService,
      limiter,
    );
    return { controller, limiter };
  }

  beforeEach(() => {
    teardown = jest.fn();
    realtimeService = {
      normalizeLastEventId: jest.fn((value?: string) => value),
      createStream: jest.fn(() => new Observable(() => teardown)),
    };
  });

  afterEach(() => {
    while (abertas.length) abertas.pop()?.unsubscribe();
    process.env = { ...originalEnv };
  });

  function abrir(controller: RealtimeController, matchId: string, request: Request) {
    const subscription = controller.stream(matchId, request).subscribe();
    abertas.push(subscription);
    return subscription;
  }

  it('libera a vaga e o stream do Redis no unsubscribe', () => {
    const { controller, limiter } = controllerWith(5);
    const { request } = requestOf('conta-1');

    const subscription = abrir(controller, 'partida-1', request);
    expect(limiter.activeConnections).toBe(1);

    subscription.unsubscribe();

    expect(limiter.activeConnections).toBe(0);
    expect(teardown).toHaveBeenCalled();
  });

  it('recusa com 429 quando a conta estoura o teto', () => {
    const { controller } = controllerWith(1);
    abrir(controller, 'partida-1', requestOf('conta-1').request);

    expect(() => controller.stream('partida-2', requestOf('conta-1').request)).toThrow(
      HttpException,
    );
  });

  // O guard barra antes, mas o canal privado não pode depender só dele para
  // saber de quem é a conexão que está contando.
  it('recusa conexão sem conta identificada', () => {
    const { controller } = controllerWith(5);

    expect(() => controller.stream('partida-1', requestOf().request)).toThrow(
      UnauthorizedException,
    );
  });
});
