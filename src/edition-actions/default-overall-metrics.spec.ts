import { OverallPosition, Prisma } from '@prisma/client';
import { DEFAULT_OVERALL_METRICS, seedDefaultOverallMetrics } from './default-overall-metrics';
import { RankingActionHandler } from './handlers/ranking-action.handler';
import { EditionActionContext } from './edition-actions.types';

function mockTransaction(options: { activeMetrics?: number; closed?: boolean } = {}) {
  return {
    overallClosure: {
      findFirst: jest.fn().mockResolvedValue(options.closed ? { id: 'fechamento-1' } : null),
    },
    overallMetric: {
      count: jest.fn().mockResolvedValue(options.activeMetrics ?? 0),
      createMany: jest.fn().mockResolvedValue({ count: DEFAULT_OVERALL_METRICS.length }),
    },
  };
}

function createManyArgs(transaction: ReturnType<typeof mockTransaction>) {
  const [call] = transaction.overallMetric.createMany.mock.calls;
  return call[0] as { data: Array<Record<string, unknown>>; skipDuplicates?: boolean };
}

describe('seedDefaultOverallMetrics', () => {
  it('semeia o catálogo padrão quando a edição não pontua nada', async () => {
    const transaction = mockTransaction();

    const created = await seedDefaultOverallMetrics(
      transaction as unknown as Prisma.TransactionClient,
      'edicao-1',
    );

    expect(created).toBe(4);
    expect(createManyArgs(transaction).data).toEqual([
      {
        editionId: 'edicao-1',
        clientId: 'metric-champion',
        name: 'Campeão da modalidade',
        defaultPoints: 10,
        position: OverallPosition.CHAMPION,
      },
      {
        editionId: 'edicao-1',
        clientId: 'metric-runner-up',
        name: 'Vice-campeão',
        defaultPoints: 7,
        position: OverallPosition.RUNNER_UP,
      },
      {
        editionId: 'edicao-1',
        clientId: 'metric-third',
        name: 'Terceiro lugar',
        defaultPoints: 5,
        position: OverallPosition.THIRD,
      },
      {
        editionId: 'edicao-1',
        clientId: 'metric-participation',
        name: 'Participação',
        defaultPoints: 1,
        position: OverallPosition.PARTICIPATION,
      },
    ]);
  });

  it('não duplica: uma segunda chamada não escreve nada', async () => {
    const transaction = mockTransaction({ activeMetrics: 4 });

    const created = await seedDefaultOverallMetrics(
      transaction as unknown as Prisma.TransactionClient,
      'edicao-1',
    );

    expect(created).toBe(0);
    expect(transaction.overallMetric.createMany).not.toHaveBeenCalled();
  });

  it('respeita um catálogo já curado, mesmo que seja uma métrica só', async () => {
    const transaction = mockTransaction({ activeMetrics: 1 });

    await seedDefaultOverallMetrics(transaction as unknown as Prisma.TransactionClient, 'edicao-1');

    expect(transaction.overallMetric.count).toHaveBeenCalledWith({
      where: { editionId: 'edicao-1', removedAt: null },
    });
    expect(transaction.overallMetric.createMany).not.toHaveBeenCalled();
  });

  it('não ressuscita uma métrica padrão que alguém removeu', async () => {
    const transaction = mockTransaction();

    await seedDefaultOverallMetrics(transaction as unknown as Prisma.TransactionClient, 'edicao-1');

    // A linha removida continua ocupando (editionId, clientId); pular é o que
    // impede a semeadura de trazê-la de volta.
    expect(createManyArgs(transaction).skipDuplicates).toBe(true);
  });
});

describe('RankingActionHandler.seedDefaultMetrics', () => {
  const handler = new RankingActionHandler();

  function contextWith(transaction: unknown): EditionActionContext {
    return {
      transaction,
      edition: { id: 'edicao-1' } as EditionActionContext['edition'],
      user: { id: 'user-1', isSuperAdmin: true },
      actorName: 'Operadora',
      scope: { kind: 'full' },
    } as EditionActionContext;
  }

  it('semeia a edição da rota e devolve o ID auditável', async () => {
    const transaction = mockTransaction();

    const result = await handler.seedDefaultMetrics(contextWith(transaction), {
      editionId: 'edicao-1',
    });

    expect(transaction.overallMetric.createMany).toHaveBeenCalled();
    expect(result).toEqual({ entityType: 'OverallMetric', entityId: 'edicao-1' });
  });

  it('é idempotente: o segundo clique no botão não erra nem duplica', async () => {
    const transaction = mockTransaction({ activeMetrics: 4 });

    await expect(
      handler.seedDefaultMetrics(contextWith(transaction), { editionId: 'edicao-1' }),
    ).resolves.toEqual({ entityType: 'OverallMetric', entityId: 'edicao-1' });
    expect(transaction.overallMetric.createMany).not.toHaveBeenCalled();
  });

  it('recusa semear a edição errada', async () => {
    const transaction = mockTransaction();

    await expect(
      handler.seedDefaultMetrics(contextWith(transaction), { editionId: 'edicao-2' }),
    ).rejects.toThrow('As métricas padrão devem pertencer à edição da rota.');
    expect(transaction.overallMetric.createMany).not.toHaveBeenCalled();
  });

  it('recusa semear com o ranking fechado', async () => {
    const transaction = mockTransaction({ closed: true });

    await expect(
      handler.seedDefaultMetrics(contextWith(transaction), { editionId: 'edicao-1' }),
    ).rejects.toThrow('O ranking geral está fechado. Reabra-o antes de alterar dados.');
    expect(transaction.overallMetric.createMany).not.toHaveBeenCalled();
  });

  it('recusa um payload com campos que a ação não conhece', async () => {
    const transaction = mockTransaction();

    await expect(
      handler.seedDefaultMetrics(contextWith(transaction), {
        editionId: 'edicao-1',
        metrics: [],
      }),
    ).rejects.toThrow('O payload possui campo(s) não permitido(s): metrics.');
  });
});
