import { MatchStatus, PhaseType, Prisma } from '@prisma/client';
import { EditionActionRecalculationService } from './edition-action-recalculation.service';

/**
 * O cruzamento da primeira rodada é uma decisão da organização, escrita na
 * planilha: "1º GRUPO A x MELHOR TERCEIRO COLOCADO". Não sai de regra nenhuma
 * de semeadura, e a semeadura automática do app monta uma chave diferente.
 *
 * Como a chave entra na agenda antes de os grupos acabarem, ela fica pública
 * com esses rótulos. Se a geração ignorasse os rótulos, o público veria uma
 * chave durante toda a fase de grupos e jogaria outra.
 */
describe('EditionActionRecalculationService — a chave publicada manda', () => {
  const service = new EditionActionRecalculationService();
  const TORNEIO = 'futsal-masc';

  // Três grupos de três, dois classificados por grupo e dois melhores terceiros
  // — exatamente o Futsal Masculino de 2026.
  const GRUPOS = [
    {
      id: 'g-a',
      name: 'Grupo A',
      entries: [{ entryId: 'alfa1' }, { entryId: 'alfa2' }, { entryId: 'alfa3' }],
    },
    {
      id: 'g-b',
      name: 'Grupo B',
      entries: [{ entryId: 'beta1' }, { entryId: 'beta2' }, { entryId: 'beta3' }],
    },
    {
      id: 'g-c',
      name: 'Grupo C',
      entries: [{ entryId: 'gama1' }, { entryId: 'gama2' }, { entryId: 'gama3' }],
    },
  ];

  // Entre os terceiros, beta3 tem mais pontos que gama3, que tem mais que alfa3.
  const CLASSIFICACAO = [
    { entryId: 'alfa1', rank: 1, points: 9, scoreFor: 10, scoreAgainst: 2 },
    { entryId: 'alfa2', rank: 2, points: 6, scoreFor: 7, scoreAgainst: 5 },
    { entryId: 'alfa3', rank: 3, points: 3, scoreFor: 3, scoreAgainst: 8 },
    { entryId: 'beta1', rank: 1, points: 9, scoreFor: 9, scoreAgainst: 1 },
    { entryId: 'beta2', rank: 2, points: 6, scoreFor: 6, scoreAgainst: 4 },
    { entryId: 'beta3', rank: 3, points: 5, scoreFor: 6, scoreAgainst: 6 },
    { entryId: 'gama1', rank: 1, points: 7, scoreFor: 8, scoreAgainst: 3 },
    { entryId: 'gama2', rank: 2, points: 5, scoreFor: 5, scoreAgainst: 5 },
    { entryId: 'gama3', rank: 3, points: 4, scoreFor: 4, scoreAgainst: 7 },
  ];

  /** A chave como a organização publicou, com o rótulo no lugar do participante. */
  const CHAVE_PUBLICADA = [
    { slot: 1, a: '1 GRUPO A', b: 'MELHOR TERCEIRO COLOCADO' },
    { slot: 2, a: '1 GRUPO B', b: '2º MELHOR TERCEIRO COLOCADO' },
    { slot: 3, a: '1 GRUPO C', b: '2 GRUPO A' },
    { slot: 4, a: '2 GRUPO B', b: '2 GRUPO C' },
  ];

  function montar(chave: Array<{ slot: number; a: string; b: string }>) {
    const agendadas = chave.map((jogo) => ({
      id: TORNEIO + '-advanced-r1-' + jogo.slot,
      round: 1,
      bracketSlot: jogo.slot,
      entryAId: null,
      entryBId: null,
      placeholderA: jogo.a,
      placeholderB: jogo.b,
      winnerEntryId: null,
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date('2026-09-07T11:00:00Z'),
    }));
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      match: {
        findMany: jest.fn((args: { where: Record<string, unknown> }) => {
          // Fase de grupos encerrada: é o que destrava o mata-mata.
          if (args.where.phaseId === 'grupos') {
            return Promise.resolve(
              [1, 2, 3].map(() => ({
                status: MatchStatus.FINISHED,
                scheduledAt: new Date('2026-09-06T12:00:00Z'),
              })),
            );
          }
          return Promise.resolve(agendadas);
        }),
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(agendadas.find((partida) => partida.id === args.where.id) ?? null),
        ),
        update,
        create,
      },
      phaseStanding: { findMany: jest.fn().mockResolvedValue(CLASSIFICACAO) },
      tournament: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    const tournament = {
      id: TORNEIO,
      status: 'ONGOING',
      config: { advancement: { perGroup: 2, bestThirds: 2 } },
      phases: [
        { id: 'grupos', order: 1, type: PhaseType.GROUP, config: null, groups: GRUPOS },
        { id: 'mata-mata', order: 2, type: PhaseType.KNOCKOUT, config: null, groups: [] },
      ],
      entries: GRUPOS.flatMap((grupo) =>
        grupo.entries.map((entry) => ({
          id: entry.entryId,
          seed: null,
          team: { name: entry.entryId },
          athlete: null,
        })),
      ),
    };

    const progredir = () =>
      (
        service as unknown as {
          progressKnockout(t: Prisma.TransactionClient, torneio: unknown): Promise<void>;
        }
      ).progressKnockout(transaction, tournament);

    const confrontos = () =>
      update.mock.calls.map((chamada) => ({
        id: chamada[0].where.id as string,
        a: chamada[0].data.entryAId as string,
        b: chamada[0].data.entryBId as string,
      }));

    return { progredir, confrontos, update, create };
  }

  it('resolve cada rótulo contra a classificação real', async () => {
    const { progredir, confrontos, create } = montar(CHAVE_PUBLICADA);
    await progredir();

    expect(create).not.toHaveBeenCalled();
    expect(confrontos()).toEqual([
      { id: TORNEIO + '-advanced-r1-1', a: 'alfa1', b: 'beta3' },
      { id: TORNEIO + '-advanced-r1-2', a: 'beta1', b: 'gama3' },
      { id: TORNEIO + '-advanced-r1-3', a: 'gama1', b: 'alfa2' },
      { id: TORNEIO + '-advanced-r1-4', a: 'beta2', b: 'gama2' },
    ]);
  });

  it('a chave publicada é diferente da que a semeadura automática montaria', async () => {
    // Este é o teste que justifica todo o resto. A semeadura padrão cruza o 1º
    // geral com o último classificado: daria alfa1 × gama3 e gama1 × gama2. Se
    // um dia isto for "simplificado" de volta para a semeadura, aparece aqui.
    const { progredir, confrontos } = montar(CHAVE_PUBLICADA);
    await progredir();

    expect(confrontos()[0]).toEqual({ id: TORNEIO + '-advanced-r1-1', a: 'alfa1', b: 'beta3' });
    expect(confrontos()[2]).toEqual({ id: TORNEIO + '-advanced-r1-3', a: 'gama1', b: 'alfa2' });
  });

  it('rótulo que o app não entende faz cair na semeadura automática, e não em meia chave', async () => {
    const { progredir, confrontos } = montar([
      { slot: 1, a: '1 GRUPO A', b: 'O TIME QUE A COMISSÃO ESCOLHER' },
      { slot: 2, a: '1 GRUPO B', b: '2º MELHOR TERCEIRO COLOCADO' },
      { slot: 3, a: '1 GRUPO C', b: '2 GRUPO A' },
      { slot: 4, a: '2 GRUPO B', b: '2 GRUPO C' },
    ]);
    await progredir();

    // Semeadura padrão: o 1º geral contra o último classificado.
    expect(confrontos()[0]).toEqual({ id: TORNEIO + '-advanced-r1-1', a: 'alfa1', b: 'gama3' });
  });

  it('recusa a chave que repete uma equipe — é planilha errada, não chave', async () => {
    const { progredir, confrontos } = montar([
      { slot: 1, a: '1 GRUPO A', b: 'MELHOR TERCEIRO COLOCADO' },
      { slot: 2, a: '1 GRUPO A', b: '2º MELHOR TERCEIRO COLOCADO' },
      { slot: 3, a: '1 GRUPO C', b: '2 GRUPO A' },
      { slot: 4, a: '2 GRUPO B', b: '2 GRUPO C' },
    ]);
    await progredir();

    expect(confrontos()[0].b).toBe('gama3');
  });
});
