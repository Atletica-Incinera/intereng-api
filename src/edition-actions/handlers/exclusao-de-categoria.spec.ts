import { ConflictException } from '@nestjs/common';
import { CategoryActionHandler } from './category-action.handler';
import { EditionActionContext } from '../edition-actions.types';

/**
 * A trava aqui e mais severa que a da modalidade, e o motivo esta no banco:
 * `Match` cascateia de `Phase`, que cascateia de `Tournament`. Apagar uma
 * categoria com jogos levaria junto partidas, lances e resultados -- sem
 * aviso, sem volta, e sem nada na tela sugerindo que aconteceria.
 *
 * Por isso so cai o que nunca foi usado: rascunho, sem participante e sem
 * jogo. Foi esse o caso que motivou a acao -- a categoria duplicada por erro
 * de digitacao, que ficava na lista e nao tinha como sair. Categoria em uso se
 * arquiva pela situacao.
 */
describe('CategoryActionHandler — exclusão de categoria', () => {
  function montar(opcoes: { status?: string; participantes?: number; jogos?: number } = {}) {
    const remover = jest.fn().mockResolvedValue({ id: 'cat-1' });
    const context = {
      edition: { id: 'ed-2026' },
      transaction: {
        tournament: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'cat-1', editionDisciplineId: 'ed-futsal', config: null }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            status: opcoes.status ?? 'DRAFT',
            editionDisciplineId: 'ed-futsal',
          }),
          delete: remover,
        },
        tournamentEntry: { count: jest.fn().mockResolvedValue(opcoes.participantes ?? 0) },
        match: { count: jest.fn().mockResolvedValue(opcoes.jogos ?? 0) },
      },
    } as unknown as EditionActionContext;
    return { handler: new CategoryActionHandler(), context, remover };
  }

  it('apaga a categoria em rascunho que nunca foi usada', async () => {
    const { handler, context, remover } = montar();
    await handler.delete(context, { id: 'cat-1' });
    expect(remover).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
  });

  it('recusa quando há jogo agendado — o cascade levaria os resultados junto', async () => {
    const { handler, context, remover } = montar({ jogos: 13 });
    await expect(handler.delete(context, { id: 'cat-1' })).rejects.toThrow(ConflictException);
    await expect(handler.delete(context, { id: 'cat-1' })).rejects.toThrow(/13 jogos agendados/);
    expect(remover).not.toHaveBeenCalled();
  });

  it('recusa quando há equipe inscrita', async () => {
    const { handler, context, remover } = montar({ participantes: 11 });
    await expect(handler.delete(context, { id: 'cat-1' })).rejects.toThrow(/11 equipes inscritas/);
    expect(remover).not.toHaveBeenCalled();
  });

  it('nomeia os dois impedimentos quando existem os dois', async () => {
    const { handler, context } = montar({ participantes: 4, jogos: 6 });
    await expect(handler.delete(context, { id: 'cat-1' })).rejects.toThrow(
      /6 jogos agendados e 4 equipes inscritas/,
    );
  });

  it.each(['SCHEDULED', 'ONGOING', 'FINISHED'])(
    'recusa categoria em %s — publicada se arquiva, não se apaga',
    async (status) => {
      const { handler, context, remover } = montar({ status });
      await expect(handler.delete(context, { id: 'cat-1' })).rejects.toThrow(/rascunho/);
      expect(remover).not.toHaveBeenCalled();
    },
  );
});
