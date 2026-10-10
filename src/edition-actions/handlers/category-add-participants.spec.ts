import { CategoryActionHandler } from './category-action.handler';

describe('inscrição em categoria com partida operada', () => {
  const handler = new CategoryActionHandler();
  const structure = {
    format: 'LEAGUE',
    advancement: { perGroup: 2 },
    participants: [{ name: 'Halterada', seed: 1 }],
    phases: [
      {
        clientId: 'groups',
        name: 'Fase de grupos',
        type: 'LEAGUE',
        qualifiers: 2,
        groups: [
          { name: 'Grupo A', participants: ['Halterada'] },
          { name: 'Grupo B', participants: [] },
        ],
      },
    ],
  };
  const check = (requested: typeof structure) =>
    handler['onlyAddsParticipants'](JSON.stringify(structure), JSON.stringify(requested));

  it('permite adicionar equipe mantendo toda a estrutura existente', () => {
    expect(
      check({
        ...structure,
        participants: [...structure.participants, { name: 'Devoradora', seed: 2 }],
        phases: [
          {
            ...structure.phases[0],
            groups: [
              structure.phases[0].groups[0],
              { name: 'Grupo B', participants: ['Devoradora'] },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('impede mover equipe já inscrita de grupo', () => {
    expect(
      check({
        ...structure,
        participants: [...structure.participants, { name: 'Devoradora', seed: 2 }],
        phases: [
          {
            ...structure.phases[0],
            groups: [
              { name: 'Grupo A', participants: [] },
              { name: 'Grupo B', participants: ['Devoradora', 'Halterada'] },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('impede alterar o seed da equipe existente', () => {
    expect(
      check({
        ...structure,
        participants: [
          { name: 'Halterada', seed: 3 },
          { name: 'Devoradora', seed: 2 },
        ],
      }),
    ).toBe(false);
  });
});
