import { ConflictException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
import { MatchActionHandler } from './match-action.handler';

/**
 * Dizer quem marcou é o que faz a artilharia existir. Só que no ginásio a mesa
 * não tem tempo: o gol entra na hora, e escolher o autor no meio do jogo é o
 * tipo de coisa que ou não acontece, ou acontece errado.
 *
 * A ação já era separada do gol justamente por isso. O que faltava era ela
 * valer DEPOIS do apito — e não valia: exigia a trava de operador, que vence
 * sozinha quando a mesa fecha a tela. Na prática, a atribuição pós-jogo
 * simplesmente não acontecia.
 *
 * A trava continua valendo enquanto a partida está ao vivo, que é para o que
 * ela existe: dois aparelhos não brigarem pelo placar.
 */
describe('MatchActionHandler — quem marcou, depois do jogo', () => {
  function montar(status: MatchStatus) {
    const handler = new MatchActionHandler() as unknown as {
      assertOperator: jest.Mock;
      matchOrThrow: jest.Mock;
      attributeEvent(c: unknown, p: Record<string, unknown>): Promise<unknown>;
    };
    handler.matchOrThrow = jest.fn().mockResolvedValue({ id: 'partida-1', status });
    handler.assertOperator = jest.fn(() => {
      // O mesmo erro que a trava vencida produz quando a tela ja foi fechada.
      throw new ConflictException('A partida não possui uma trava de operador ativa.');
    });
    const context = {
      transaction: { matchEvent: { findFirst: jest.fn().mockResolvedValue(null) } },
    };
    const chamar = () =>
      handler.attributeEvent(context, {
        id: 'partida-1',
        eventId: 'evento-1',
        athleteId: 'atleta-1',
      });
    return { chamar, assertOperator: () => handler.assertOperator };
  }

  it('ao vivo, exige a trava de operador', async () => {
    const { chamar, assertOperator } = montar(MatchStatus.LIVE);
    await expect(chamar()).rejects.toThrow(/trava de operador/);
    expect(assertOperator()).toHaveBeenCalled();
  });

  it.each([MatchStatus.FINISHED, MatchStatus.WALKOVER])(
    'em %s, não exige a trava — a mesa já fechou a tela',
    async (status) => {
      const { chamar, assertOperator } = montar(status);
      // Passa da trava e segue para a busca do evento, que aqui não existe.
      await expect(chamar()).rejects.toThrow(/Evento não encontrado/);
      expect(assertOperator()).not.toHaveBeenCalled();
    },
  );
});
