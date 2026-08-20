import { HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, type Subscription } from 'rxjs';
import { EditionRealtimeController } from './edition-realtime.controller';
import type { RealtimeService } from './realtime.service';
import { SseConnectionLimiter } from './sse-connection-limiter.service';

describe('EditionRealtimeController', () => {
  const originalEnv = { ...process.env };
  let teardown: jest.Mock;
  // A reconciliação periódica é um `interval` sem fim: assinatura esquecida
  // segura o event loop e trava a suíte.
  const abertas: Subscription[] = [];
  let realtimeService: jest.Mocked<
    Pick<
      RealtimeService,
      | 'normalizeLastEventId'
      | 'prepareEditionStream'
      | 'createEditionStream'
      | 'resolveEditionRevision'
    >
  >;

  function requestFrom(ip: string) {
    const closeHandlers: Array<() => void> = [];
    const request = {
      headers: { 'x-forwarded-for': ip },
      ip: '10.0.0.1',
      on: (event: string, handler: () => void) => {
        if (event === 'close') closeHandlers.push(handler);
      },
    };
    return { request: request as unknown as Request, closeHandlers };
  }

  function controllerWith(limits: { global: number; porIp: number }) {
    process.env.REALTIME_SSE_MAX_GLOBAL = String(limits.global);
    process.env.REALTIME_SSE_MAX_PER_IP = String(limits.porIp);
    const limiter = new SseConnectionLimiter();
    const controller = new EditionRealtimeController(
      realtimeService as unknown as RealtimeService,
      limiter,
    );
    return { controller, limiter };
  }

  beforeEach(() => {
    teardown = jest.fn();
    realtimeService = {
      normalizeLastEventId: jest.fn((value?: string) => value),
      prepareEditionStream: jest.fn().mockResolvedValue({
        routeEditionId: 'active',
        streamEditionId: 'active',
        editionId: 'ed-1',
        revision: 3,
        cursor: '0-0',
      }),
      createEditionStream: jest.fn(() => new Observable(() => teardown)),
      resolveEditionRevision: jest.fn().mockResolvedValue({ editionId: 'ed-1', revision: 3 }),
    } as never;
  });

  afterEach(() => {
    while (abertas.length) abertas.pop()?.unsubscribe();
    process.env = { ...originalEnv };
  });

  function abrir(controller: EditionRealtimeController, request: Request) {
    const subscription = controller.stream('active', request).subscribe();
    abertas.push(subscription);
    return subscription;
  }

  it('devolve a vaga e solta o stream do Redis quando o cliente desaparece', async () => {
    const { controller, limiter } = controllerWith({ global: 10, porIp: 10 });
    const { request } = requestFrom('198.51.100.7');

    const subscription = abrir(controller, request);
    expect(limiter.activeConnections).toBe(1);

    // O stream interno só nasce depois que a preparação resolve; sem esperar,
    // o teste mediria o teardown de um Observable que ainda não existia.
    await Promise.resolve();
    await Promise.resolve();

    subscription.unsubscribe();

    expect(limiter.activeConnections).toBe(0);
    expect(teardown).toHaveBeenCalled();
  });

  it('devolve a vaga também pelo close da requisição, sem unsubscribe', () => {
    const { controller, limiter } = controllerWith({ global: 10, porIp: 10 });
    const { request, closeHandlers } = requestFrom('198.51.100.7');

    abrir(controller, request);
    expect(limiter.activeConnections).toBe(1);

    for (const handler of closeHandlers) handler();

    expect(limiter.activeConnections).toBe(0);
  });

  it('recusa com 429 antes de abrir qualquer recurso quando a origem estoura o teto', () => {
    const { controller, limiter } = controllerWith({ global: 10, porIp: 1 });
    abrir(controller, requestFrom('198.51.100.7').request);
    realtimeService.prepareEditionStream.mockClear();

    expect(() => controller.stream('active', requestFrom('198.51.100.7').request)).toThrow(
      HttpException,
    );
    expect(realtimeService.prepareEditionStream).not.toHaveBeenCalled();
    expect(limiter.activeConnections).toBe(1);
  });

  it('segue público: conexão sem token continua sendo aceita', () => {
    const { controller } = controllerWith({ global: 10, porIp: 10 });
    const { request } = requestFrom('198.51.100.7');

    expect(() => abrir(controller, request)).not.toThrow();
  });
});
