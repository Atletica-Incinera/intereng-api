import { lerColocacao, nomeDoGrupo, dependeDeOutroJogo } from './colocacao-do-chaveamento';

/**
 * Os rótulos aqui são os que estão nas planilhas do InterEng 2026 — copiados
 * das abas, não inventados. Cada aba escreve a mesma coisa de um jeito.
 */
describe('lerColocacao — os rótulos da chave publicada', () => {
  it.each([
    ['1 GRUPO A', { tipo: 'grupo', grupo: 'A', posicao: 1 }],
    ['1º GRUPO B', { tipo: 'grupo', grupo: 'B', posicao: 1 }],
    ['2 GRUPO C', { tipo: 'grupo', grupo: 'C', posicao: 2 }],
    ['2º grupo a', { tipo: 'grupo', grupo: 'A', posicao: 2 }],
    ['1 GRUPO ÚNICO', { tipo: 'grupo', grupo: 'UNICO', posicao: 1 }],
    // Voleibol e handebol escrevem por extenso.
    ['MELHOR CLASSIFICADO A', { tipo: 'grupo', grupo: 'A', posicao: 1 }],
    ['SEGUNDO MELHOR B', { tipo: 'grupo', grupo: 'B', posicao: 2 }],
    ['SEGUNDO MELHOR CLASSIFICADO DO GRUPO C', { tipo: 'grupo', grupo: 'C', posicao: 2 }],
    // Futsal masculino, onde há melhores terceiros.
    ['MELHOR TERCEIRO COLOCADO', { tipo: 'melhor-terceiro', posicao: 1 }],
    ['2º MELHOR TERCEIRO COLOCADO', { tipo: 'melhor-terceiro', posicao: 2 }],
    ['SEGUNDO MELHOR TERCEIRO', { tipo: 'melhor-terceiro', posicao: 2 }],
  ])('%s', (rotulo, esperado) => {
    expect(lerColocacao(rotulo)).toEqual(esperado);
  });

  it('"MELHOR TERCEIRO COLOCADO" não vira o grupo "TERCEIRO COLOCADO"', () => {
    // A forma "MELHOR <grupo>" casaria com este texto. Por isso os terceiros
    // são testados antes — e por isso este caso tem um teste só para ele.
    expect(lerColocacao('MELHOR TERCEIRO COLOCADO')).toEqual({
      tipo: 'melhor-terceiro',
      posicao: 1,
    });
  });

  it.each([
    ['VENCEDOR J15', 'aponta para outro jogo, não para a classificação'],
    ['PERDEDOR J19', 'idem'],
    ['ALCATEIA', 'é uma equipe, não um rótulo'],
    ['', 'vazio'],
    ['0 GRUPO A', 'não existe colocação zero'],
  ])('não lê "%s" — %s', (rotulo) => {
    expect(lerColocacao(rotulo)).toBeNull();
  });

  it('reconhece o que depende de outro jogo', () => {
    expect(dependeDeOutroJogo('VENCEDOR J15')).toBe(true);
    expect(dependeDeOutroJogo('Perdedor J19')).toBe(true);
    expect(dependeDeOutroJogo('1 GRUPO A')).toBe(false);
  });

  it('trata "A" e "GRUPO A" como o mesmo grupo', () => {
    expect(nomeDoGrupo('Grupo A')).toBe('A');
    expect(nomeDoGrupo('A')).toBe('A');
    expect(nomeDoGrupo('grupo único')).toBe('UNICO');
  });
});
