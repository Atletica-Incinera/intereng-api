import { MatchActionHandler } from './match-action.handler';

/**
 * O cronômetro corre no aparelho do mesário — a tela calcula o decorrido como
 * `Date.now() - runningSince`. Carimbar o início no servidor misturava as duas
 * fontes de tempo, e a diferença entre elas virava tempo já corrido no instante
 * em que a partida começava.
 */
describe('MatchActionHandler — início do cronômetro', () => {
  const handler = new MatchActionHandler({} as never);
  const aceitar = (patch: Record<string, unknown>, agora: Date): Date =>
    (
      handler as unknown as {
        acceptClientClockStart(patch: Record<string, unknown>, serverNow: Date): Date;
      }
    ).acceptClientClockStart(patch, agora);

  const agora = new Date('2026-10-13T20:00:00.000Z');

  it('usa o carimbo do aparelho que opera, para a conta ficar na mesma base', () => {
    // Dois minutos adiantado: aceito como está. É o que faz o cronômetro nascer
    // em zero na tela de quem opera, em vez de nascer com dois minutos corridos.
    const doAparelho = new Date(agora.getTime() + 2 * 60 * 1000);
    expect(aceitar({ runningSince: doAparelho.toISOString() }, agora)).toEqual(doAparelho);
  });

  it('recusa desvio grande demais e volta para o relógio do servidor', () => {
    // Aparelho com a data errada por horas gravaria um cronômetro que já nasce
    // com meio jogo corrido. Fora da janela, perde-se a precisão e não o dado.
    const absurdo = new Date(agora.getTime() - 6 * 60 * 60 * 1000);
    expect(aceitar({ runningSince: absurdo.toISOString() }, agora)).toEqual(agora);
  });

  it('sem carimbo do cliente, vale o do servidor', () => {
    expect(aceitar({}, agora)).toEqual(agora);
  });

  it('carimbo ilegível não derruba o início da partida', () => {
    expect(aceitar({ runningSince: 'nao-e-uma-data' }, agora)).toEqual(agora);
  });
});
