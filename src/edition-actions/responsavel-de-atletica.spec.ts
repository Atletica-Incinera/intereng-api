import { ForbiddenException } from '@nestjs/common';
import { EditionActionsService } from './edition-actions.service';

/**
 * Responsavel de atletica: um papel que alcanca uma equipe so.
 *
 * Os dois papeis que existiam se prendem a edicao inteira ou a uma modalidade.
 * Nenhum descrevia "cuida apenas da minha equipe", entao dar acesso a uma
 * atletica significava dar acesso a mais do que ela deveria ver.
 *
 * A segunda metade deste arquivo e a que nao e obvia. `athlete/update` carrega
 * a equipe do atleta no payload; sem olhar o estado ATUAL, um responsavel
 * editaria o atleta de outra atletica e o traria para a sua no mesmo
 * movimento, passando pela verificacao de payload sem nunca ter tido acesso
 * aquele atleta.
 */
describe('EditionActionsService — alcance do responsável de atlética', () => {
  const escopo = { kind: 'team' as const, teamId: 'alcateia' };

  function servico() {
    return new EditionActionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  function autorizar(alvo: EditionActionsService) {
    return (
      alvo as unknown as {
        authorizeTeamManager(
          transaction: unknown,
          editionId: string,
          scope: { kind: 'team'; teamId: string },
          actionType: string,
          payload: Record<string, unknown>,
        ): Promise<void>;
      }
    ).authorizeTeamManager.bind(alvo);
  }

  function transacao(equipeAtual: string | null) {
    return {
      editionAthlete: {
        findFirst: jest
          .fn()
          .mockResolvedValue(equipeAtual === null ? null : { teamId: equipeAtual }),
      },
    };
  }

  it('cadastra atleta na própria equipe', async () => {
    await expect(
      autorizar(servico())(transacao('alcateia'), 'ed-2026', escopo, 'athlete/create', {
        id: 'atleta-1',
        athlete: { name: 'Marina Souza', teamId: 'alcateia', modalities: ['Futsal'] },
      }),
    ).resolves.toBeUndefined();
  });

  it('recusa cadastrar atleta em outra equipe', async () => {
    await expect(
      autorizar(servico())(transacao('alcateia'), 'ed-2026', escopo, 'athlete/create', {
        id: 'atleta-1',
        athlete: { name: 'Marina Souza', teamId: 'voraz', modalities: ['Futsal'] },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('recusa cadastro sem equipe — não existe atleta solto para este papel', async () => {
    await expect(
      autorizar(servico())(transacao('alcateia'), 'ed-2026', escopo, 'athlete/create', {
        id: 'atleta-1',
        athlete: { name: 'Marina Souza', modalities: ['Futsal'] },
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('ajusta atleta que já é da própria equipe', async () => {
    await expect(
      autorizar(servico())(transacao('alcateia'), 'ed-2026', escopo, 'athlete/update', {
        id: 'atleta-1',
        patch: { modalities: ['Futsal', 'Basquete'] },
      }),
    ).resolves.toBeUndefined();
  });

  it('recusa puxar o atleta de outra atlética para a sua', async () => {
    // O payload nao menciona equipe nenhuma: a recusa vem do estado atual.
    await expect(
      autorizar(servico())(transacao('voraz'), 'ed-2026', escopo, 'athlete/update', {
        id: 'atleta-1',
        patch: { modalities: ['Futsal'] },
      }),
    ).rejects.toThrow(/não é da equipe do responsável/);
  });

  it.each([
    'team/create',
    'team/update',
    'discipline/update',
    'match/registerEvent',
    'category/create',
    'staff/upsert',
    'ranking/addAwards',
  ])('recusa %s — o papel só alcança o elenco', async (acao) => {
    await expect(
      autorizar(servico())(transacao('alcateia'), 'ed-2026', escopo, acao, {}),
    ).rejects.toThrow(ForbiddenException);
  });
});
