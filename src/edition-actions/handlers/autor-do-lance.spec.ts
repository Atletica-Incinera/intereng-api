import { ConflictException, NotFoundException } from '@nestjs/common';
import { MatchActionHandler } from './match-action.handler';
import { EditionActionContext } from '../edition-actions.types';

/**
 * A artilharia depende de a mesa dizer quem fez o gol. Duas decisoes moldam
 * esta validacao, e as duas puxam para lados opostos:
 *
 * O autor e OPCIONAL. Artilharia nao pode travar o placar: se o elenco nao
 * estiver carregado, ou se ninguem viu quem desviou, o gol precisa entrar do
 * mesmo jeito. Um gol sem autor e uma lacuna na estatistica; um gol que nao
 * entra e um placar errado no ginasio.
 *
 * O autor ERRADO e recusado. Atleta de outra equipe leva o gol para o
 * artilheiro errado, e isso e pior que gol sem autor -- a lacuna se ve, a
 * atribuicao errada nao.
 */
describe('MatchActionHandler — autor do lance', () => {
  const partida = { entryAId: 'entry-alcateia', entryBId: 'entry-voraz', editionDisciplineId: 'ed-futsal' };

  function montar(opcoes: { entry?: unknown; atleta?: unknown; noElenco?: boolean } = {}) {
    const context = {
      transaction: {
        tournamentEntry: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              opcoes.entry === undefined ? { teamId: 'alcateia', athleteId: null } : opcoes.entry,
            ),
        },
        athlete: {
          findUnique: jest
            .fn()
            .mockResolvedValue(
              opcoes.atleta === undefined ? { id: 'atleta-1', name: 'Marina Souza' } : opcoes.atleta,
            ),
        },
        editionRoster: {
          findFirst: jest.fn().mockResolvedValue(opcoes.noElenco === false ? null : { id: 'r1' }),
        },
      },
    } as unknown as EditionActionContext;

    const resolver = (
      new MatchActionHandler() as unknown as {
        resolveEventAthlete(
          c: EditionActionContext,
          m: typeof partida,
          e: Record<string, unknown>,
          s: 'home' | 'away' | 'neutral',
        ): Promise<string | null>;
      }
    ).resolveEventAthlete.bind(new MatchActionHandler());

    return { context, resolver };
  }

  it('aceita o lance sem autor — a artilharia não trava o placar', async () => {
    const { context, resolver } = montar();
    await expect(resolver(context, partida, {}, 'home')).resolves.toBeNull();
    await expect(resolver(context, partida, { athleteId: null }, 'home')).resolves.toBeNull();
  });

  it('aceita o autor que está no elenco da equipe daquele lado', async () => {
    const { context, resolver } = montar();
    await expect(resolver(context, partida, { athleteId: 'atleta-1' }, 'home')).resolves.toBe(
      'atleta-1',
    );
  });

  it('recusa autor que não está no elenco daquela equipe', async () => {
    const { context, resolver } = montar({ noElenco: false });
    await expect(resolver(context, partida, { athleteId: 'atleta-1' }, 'home')).rejects.toThrow(
      ConflictException,
    );
    await expect(resolver(context, partida, { athleteId: 'atleta-1' }, 'home')).rejects.toThrow(
      /não está no elenco/,
    );
  });

  it('recusa autor inexistente', async () => {
    const { context, resolver } = montar({ atleta: null });
    await expect(resolver(context, partida, { athleteId: 'fantasma' }, 'home')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('recusa autor em lance neutro', async () => {
    const { context, resolver } = montar();
    await expect(resolver(context, partida, { athleteId: 'atleta-1' }, 'neutral')).rejects.toThrow(
      ConflictException,
    );
  });

  it('na modalidade individual, o autor tem de ser quem disputa a partida', async () => {
    const { context, resolver } = montar({ entry: { teamId: null, athleteId: 'outro-atleta' } });
    await expect(resolver(context, partida, { athleteId: 'atleta-1' }, 'home')).rejects.toThrow(
      /não é quem disputa/,
    );
  });
});
