import { MatchStatus, PhaseType, Prisma } from '@prisma/client';
import { EditionActionRecalculationService } from './edition-action-recalculation.service';

/**
 * O mata-mata da planilha entra na agenda inteiro, antes de existir resultado:
 * "VENCEDOR J1 x VENCEDOR J2", dia 7, 15h, Ginásio A. Ele fica público assim,
 * com os rótulos, e é isso que deixa a chave visível durante a fase de grupos.
 *
 * Quando o resultado sai, o gerador PREENCHE essa partida. Não cria outra, e
 * não recria essa: o dia, a hora e o ginásio são da organização, foram
 * publicados e as equipes se programaram por eles. O que o resultado traz é
 * só o nome de quem joga.
 *
 * Este é o trecho do sistema sem plano B no dia do evento — remontar a chave à
 * mão durante o torneio não é viável. Daí os testes irem no detalhe do que a
 * atualização pode e não pode tocar.
 */
describe('EditionActionRecalculationService — chave já agendada', () => {
  const service = new EditionActionRecalculationService();
  const TORNEIO = 'futsal-masc';

  type Partida = {
    id: string;
    round: number | null;
    bracketSlot: number | null;
    entryAId: string | null;
    entryBId: string | null;
    winnerEntryId: string | null;
    status: MatchStatus;
    scheduledAt: Date | null;
  };

  /** Semifinal decidida: dois jogos oficiais, com vencedor. */
  const semifinais = (): Partida[] => [
    {
      id: `${TORNEIO}-advanced-r1-1`,
      round: 1,
      bracketSlot: 1,
      entryAId: 'alcateia',
      entryBId: 'voraz',
      winnerEntryId: 'alcateia',
      status: MatchStatus.FINISHED,
      scheduledAt: new Date('2026-09-07T13:00:00Z'),
    },
    {
      id: `${TORNEIO}-advanced-r1-2`,
      round: 1,
      bracketSlot: 2,
      entryAId: 'invasora',
      entryBId: 'trovao',
      winnerEntryId: 'trovao',
      status: MatchStatus.FINISHED,
      scheduledAt: new Date('2026-09-07T14:00:00Z'),
    },
  ];

  /** A final, como o importador a cadastrou: com rótulo e horário da planilha. */
  const finalComRotulo = (): Partida => ({
    id: `${TORNEIO}-advanced-r2-1`,
    round: 2,
    bracketSlot: 1,
    entryAId: null,
    entryBId: null,
    winnerEntryId: null,
    status: MatchStatus.SCHEDULED,
    scheduledAt: new Date('2026-09-07T18:00:00Z'),
  });

  function montar(partidas: Partida[], config: Record<string, unknown> = {}) {
    const update = jest.fn().mockResolvedValue(undefined);
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      match: {
        findMany: jest.fn().mockResolvedValue(partidas),
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve(partidas.find((partida) => partida.id === where.id) ?? null),
        ),
        update,
        create,
      },
      tournament: { update: jest.fn().mockResolvedValue(undefined) },
    } as unknown as Prisma.TransactionClient;

    const tournament = {
      id: TORNEIO,
      status: 'ONGOING',
      config,
      phases: [
        { id: 'grupos', order: 1, type: PhaseType.GROUP, config: null, groups: [] },
        { id: 'mata-mata', order: 2, type: PhaseType.KNOCKOUT, config: null, groups: [] },
      ],
      entries: [],
    };

    const progredir = () =>
      (
        service as unknown as {
          progressKnockout(t: Prisma.TransactionClient, torneio: unknown): Promise<void>;
        }
      ).progressKnockout(transaction, tournament);

    return { progredir, update, create };
  }

  it('preenche a final que já estava agendada, em vez de criar outra', async () => {
    const { progredir, update, create } = montar([...semifinais(), finalComRotulo()]);
    await progredir();

    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      where: { id: `${TORNEIO}-advanced-r2-1` },
      data: {
        entryAId: 'alcateia',
        entryBId: 'trovao',
        placeholderA: null,
        placeholderB: null,
        round: 2,
        bracketSlot: 1,
      },
    });
  });

  it('não mexe no dia, na hora nem no ginásio que a organização publicou', async () => {
    const { progredir, update } = montar([...semifinais(), finalComRotulo()]);
    await progredir();

    const dados = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(dados).not.toHaveProperty('scheduledAt');
    expect(dados).not.toHaveProperty('venue');
    expect(dados).not.toHaveProperty('status');
  });

  it('cria a final quando ela não foi cadastrada antes — o caminho de sempre', async () => {
    const { progredir, update, create } = montar(semifinais());
    await progredir();

    expect(update).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      id: `${TORNEIO}-advanced-r2-1`,
      entryAId: 'alcateia',
      entryBId: 'trovao',
    });
  });

  it('não reescreve partida que a mesa já abriu', async () => {
    // Se a chave for recalculada depois que o jogo começou, trocar quem joga
    // apagaria o que a mesa anotou. Aqui o gerador não faz nada.
    const emAndamento = { ...finalComRotulo(), status: MatchStatus.LIVE, entryAId: 'alcateia' };
    const { progredir, update, create } = montar([...semifinais(), emAndamento]);
    await progredir();

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('recalcular de novo não faz nada — a final já está preenchida', async () => {
    const finalPronta = {
      ...finalComRotulo(),
      entryAId: 'alcateia',
      entryBId: 'trovao',
    };
    const { progredir, update, create } = montar([...semifinais(), finalPronta]);
    await progredir();

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('a semifinal ainda em aberto segura a final — nada é preenchido', async () => {
    const [primeira, segunda] = semifinais();
    const emAberto = { ...segunda, status: MatchStatus.SCHEDULED, winnerEntryId: null };
    const { progredir, update, create } = montar([primeira, emAberto, finalComRotulo()]);
    await progredir();

    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('preenche a disputa de terceiro que já estava agendada', async () => {
    const terceiro: Partida = {
      id: `${TORNEIO}-advanced-third`,
      round: 2,
      bracketSlot: null,
      entryAId: null,
      entryBId: null,
      winnerEntryId: null,
      status: MatchStatus.SCHEDULED,
      scheduledAt: new Date('2026-09-07T16:00:00Z'),
    };
    const { progredir, update, create } = montar([...semifinais(), finalComRotulo(), terceiro], {
      advancement: { thirdPlaceMatch: true },
    });
    await progredir();

    expect(create).not.toHaveBeenCalled();
    // Os perdedores das duas semifinais, na ordem das chaves.
    expect(update).toHaveBeenCalledWith({
      where: { id: `${TORNEIO}-advanced-third` },
      data: { entryAId: 'voraz', entryBId: 'invasora', placeholderA: null, placeholderB: null },
    });
  });
});
