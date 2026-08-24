import type { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { RedisService } from '../common/redis/redis.service';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  function build() {
    const blockingClient = {
      on: jest.fn(),
      removeListener: jest.fn(),
      disconnect: jest.fn(),
      // Fica pendente para sempre, como o XREAD bloqueante de verdade enquanto
      // não chega evento.
      xread: jest.fn(() => new Promise(() => undefined)),
    };
    const client = {
      duplicate: jest.fn(() => blockingClient),
      xrevrange: jest.fn().mockResolvedValue([]),
    };
    const service = new RealtimeService(
      { getClient: () => client } as unknown as RedisService,
      {} as PrismaService,
      {} as EditionSnapshotsService,
    );
    return { service, client, blockingClient };
  }

  it('desconecta o cliente Redis duplicado quando ninguém mais escuta', async () => {
    const { service, blockingClient } = build();

    const subscription = service.createStream('partida-1').subscribe();
    await Promise.resolve();

    expect(blockingClient.on).toHaveBeenCalledWith('error', expect.any(Function));

    subscription.unsubscribe();

    // Sem isso, cada espectador que fecha a aba deixaria uma conexão Redis viva
    // até o processo morrer — o vazamento derruba o tempo real antes do jogo
    // acabar.
    expect(blockingClient.disconnect).toHaveBeenCalledTimes(1);
    expect(blockingClient.removeListener).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('recusa Last-Event-ID fora do formato do Redis', () => {
    const { service } = build();

    expect(() => service.normalizeLastEventId('nao-e-id')).toThrow(
      'O header Last-Event-ID possui um formato inválido.',
    );
    expect(service.normalizeLastEventId('1700000000000-0')).toBe('1700000000000-0');
    expect(service.normalizeLastEventId(undefined)).toBeUndefined();
  });
});
