import { ForbiddenException } from '@nestjs/common';
import { EditionActionsService } from './edition-actions.service';

/**
 * O gestor de modalidade passou a cadastrar e ajustar atletas. O que este
 * arquivo trava e o alcance: so a modalidade dele, e so atleta que ja e dele.
 *
 * A segunda metade e a que nao e obvia. O payload de `athlete/update` carrega
 * as modalidades do atleta; sem olhar o estado ATUAL, um gestor de Futsal
 * editaria um atleta de Basquete e o arrastaria para o Futsal no mesmo
 * movimento — passando pela verificacao de payload sem nunca ter tido acesso
 * aquele atleta.
 */
describe('EditionActionsService — alcance do gestor sobre atletas', () => {
  const escopo = { kind: 'discipline' as const, editionDisciplineId: 'ed-futsal' };

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
        authorizeManagerAthlete(
          transaction: unknown,
          editionId: string,
          scope: { kind: 'discipline'; editionDisciplineId: string },
          actionType: string,
          payload: Record<string, unknown>,
        ): Promise<void>;
      }
    ).authorizeManagerAthlete.bind(alvo);
  }

  function transacao(opcoes: { elencoDoGestor?: boolean } = {}) {
    return {
      editionDiscipline: {
        findFirst: jest.fn().mockResolvedValue({ discipline: { name: 'Futsal' } }),
      },
      editionRoster: {
        findFirst: jest.fn().mockResolvedValue(opcoes.elencoDoGestor ? { id: 'roster-1' } : null),
      },
    };
  }

  it('aceita o cadastro quando a única modalidade é a do gestor', async () => {
    const alvo = servico();
    await expect(
      autorizar(alvo)(transacao(), 'ed-2026', escopo, 'athlete/create', {
        id: 'athlete-1',
        athlete: { name: 'Marina Souza', teamId: 'team-1', modalities: ['Futsal'] },
      }),
    ).resolves.toBeUndefined();
  });

  it('recusa o cadastro que inclui modalidade de outro gestor', async () => {
    const alvo = servico();
    await expect(
      autorizar(alvo)(transacao(), 'ed-2026', escopo, 'athlete/create', {
        id: 'athlete-1',
        athlete: { name: 'Marina Souza', modalities: ['Futsal', 'Basquete'] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa o cadastro sem modalidade nenhuma: o atleta nasceria fora do alcance de quem o criou', async () => {
    const alvo = servico();
    await expect(
      autorizar(alvo)(transacao(), 'ed-2026', escopo, 'athlete/create', {
        id: 'athlete-1',
        athlete: { name: 'Marina Souza', modalities: [] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aceita a alteração de atleta que já está no elenco da modalidade do gestor', async () => {
    const alvo = servico();
    await expect(
      autorizar(alvo)(transacao({ elencoDoGestor: true }), 'ed-2026', escopo, 'athlete/update', {
        id: 'athlete-1',
        patch: { name: 'Marina S. Souza' },
      }),
    ).resolves.toBeUndefined();
  });

  it('recusa a alteração de atleta de outra modalidade — inclusive quando o payload tenta trazê-lo', async () => {
    const alvo = servico();
    await expect(
      autorizar(alvo)(transacao({ elencoDoGestor: false }), 'ed-2026', escopo, 'athlete/update', {
        id: 'athlete-do-basquete',
        patch: { modalities: ['Futsal'] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('recusa quando a modalidade atribuída ao gestor não pertence à edição', async () => {
    const alvo = servico();
    const semModalidade = {
      editionDiscipline: { findFirst: jest.fn().mockResolvedValue(null) },
      editionRoster: { findFirst: jest.fn() },
    };
    await expect(
      autorizar(alvo)(semModalidade, 'ed-2026', escopo, 'athlete/create', {
        id: 'athlete-1',
        athlete: { name: 'Marina Souza', modalities: ['Futsal'] },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
