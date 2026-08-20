import { MatchStatus, PhaseType, Prisma } from '@prisma/client';
import { EditionActionRecalculationService } from './edition-action-recalculation.service';

describe('EditionActionRecalculationService — fair play', () => {
  const service = new EditionActionRecalculationService();

  function mockTransaction(
    events: Array<{ entryId: string; metadata: Prisma.JsonValue | null }>,
    tiebreakers: string[] = ['fair-play'],
  ) {
    return {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'torneio-1',
          status: 'ONGOING',
          config: {},
          editionDiscipline: {
            // A regra de desempate vem da configuração da modalidade; o peso de
            // cada evento vem do metadata da partida, não daqui.
            config: { standings: { win: 3, draw: 1, loss: 0, tiebreakers } },
            discipline: { name: 'Futsal' },
          },
          phases: [
            {
              id: 'fase-1',
              order: 1,
              type: PhaseType.LEAGUE,
              config: null,
              groups: [],
            },
          ],
          entries: [
            { id: 'entrada-a', seed: 1, team: { name: 'Alfa' }, athlete: null },
            { id: 'entrada-b', seed: 2, team: { name: 'Beta' }, athlete: null },
          ],
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      match: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryAId: 'entrada-a',
            entryBId: 'entrada-b',
            winnerEntryId: null,
            scoreA: 2,
            scoreB: 2,
            events,
          },
        ]),
      },
      phaseStanding: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  function createdRows(transaction: ReturnType<typeof mockTransaction>) {
    const [call] = transaction.phaseStanding.createMany.mock.calls;
    return (call[0] as { data: Prisma.PhaseStandingUncheckedCreateInput[] }).data;
  }

  it('grava o acumulado de fair play que o desempate já usava', async () => {
    const transaction = mockTransaction([
      { entryId: 'entrada-a', metadata: { fairPlayPoints: 1 } },
      { entryId: 'entrada-a', metadata: { fairPlayPoints: 2 } },
      { entryId: 'entrada-b', metadata: { fairPlayPoints: 1 } },
    ]);

    await service.recomputeTournament(
      transaction as unknown as Prisma.TransactionClient,
      'torneio-1',
    );

    const rows = createdRows(transaction);
    expect(rows.find((row) => row.entryId === 'entrada-a')?.disciplinary).toBe(3);
    expect(rows.find((row) => row.entryId === 'entrada-b')?.disciplinary).toBe(1);
  });

  it('mantém a ordem coerente com o número gravado', async () => {
    const transaction = mockTransaction([
      { entryId: 'entrada-a', metadata: { fairPlayPoints: 4 } },
      { entryId: 'entrada-b', metadata: { fairPlayPoints: 0 } },
    ]);

    await service.recomputeTournament(
      transaction as unknown as Prisma.TransactionClient,
      'torneio-1',
    );

    const rows = createdRows(transaction);
    const alfa = rows.find((row) => row.entryId === 'entrada-a');
    const beta = rows.find((row) => row.entryId === 'entrada-b');
    // Menos fair play acumulado colocava Beta na frente antes desta mudança
    // também; o que faltava era o número que justifica a colocação na tela.
    expect(beta?.rank).toBe(1);
    expect(alfa?.rank).toBe(2);
    expect(beta?.disciplinary).toBe(0);
    expect(alfa?.disciplinary).toBe(4);
  });

  it('grava zero quando nenhum evento declara peso disciplinar', async () => {
    const transaction = mockTransaction([
      { entryId: 'entrada-a', metadata: { note: 'falta comum' } },
      { entryId: 'entrada-b', metadata: null },
    ]);

    await service.recomputeTournament(
      transaction as unknown as Prisma.TransactionClient,
      'torneio-1',
    );

    expect(createdRows(transaction).every((row) => row.disciplinary === 0)).toBe(true);
  });

  it('só conta partidas oficiais, como o resto da tabela', async () => {
    const transaction = mockTransaction([
      { entryId: 'entrada-a', metadata: { fairPlayPoints: 5 } },
    ]);

    await service.recomputeTournament(
      transaction as unknown as Prisma.TransactionClient,
      'torneio-1',
    );

    const [firstCall] = transaction.match.findMany.mock.calls;
    expect((firstCall[0] as { where: { status: unknown } }).where.status).toEqual({
      in: [MatchStatus.FINISHED, MatchStatus.WALKOVER],
    });
  });
});
