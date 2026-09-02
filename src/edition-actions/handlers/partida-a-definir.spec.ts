import { ConflictException } from '@nestjs/common';
import { MatchActionHandler } from './match-action.handler';

/**
 * O chaveamento da organizacao descreve confrontos que ainda nao tem dono:
 * "VENCEDOR J3", "1 GRUPO A", "MELHOR TERCEIRO COLOCADO". Eles ja tem dia,
 * hora e ginasio; o que falta e o resultado que diz quem joga.
 *
 * Ate aqui a partida so podia existir depois do resultado, e o publico so via
 * a chave quando a fase de grupos acabava. Agora ela entra na agenda com um
 * rotulo no lugar do participante.
 *
 * A regra que este arquivo trava: o rotulo e EXPLICITO. Um nome de equipe
 * errado tem de continuar sendo recusado -- se qualquer nome que nao casasse
 * virasse rotulo, um erro de digitacao criaria uma partida fantasma, agendada,
 * que ninguem consegue operar e que ninguem percebe estar errada.
 */
describe('MatchActionHandler — participante a definir', () => {
  const lado = (match: Record<string, unknown>, qual: 'A' | 'B') =>
    (
      new MatchActionHandler() as unknown as {
        ladoDaPartida(m: Record<string, unknown>, l: 'A' | 'B'): { nome?: string; rotulo?: string };
      }
    ).ladoDaPartida(match, qual);

  it('aceita a equipe inscrita, como sempre', () => {
    expect(lado({ entryA: 'Tubarões' }, 'A')).toEqual({ nome: 'Tubarões' });
  });

  it('aceita o rótulo do que ainda será decidido', () => {
    expect(lado({ placeholderA: 'Vencedor do Jogo 3' }, 'A')).toEqual({
      rotulo: 'Vencedor do Jogo 3',
    });
    expect(lado({ placeholderB: '1º do Grupo A' }, 'B')).toEqual({ rotulo: '1º do Grupo A' });
  });

  it('recusa os dois juntos — qual valeria?', () => {
    expect(() => lado({ entryA: 'Tubarões', placeholderA: 'Vencedor do Jogo 3' }, 'A')).toThrow(
      ConflictException,
    );
  });

  it('recusa o lado vazio', () => {
    expect(() => lado({}, 'A')).toThrow();
  });

  it('não transforma nome desconhecido em rótulo', () => {
    // "Tubaroes" sem acento não é um rótulo: é um nome errado, e continua
    // seguindo o caminho de equipe inscrita, onde será recusado por não
    // existir. Sem isso, todo erro de digitação viraria partida fantasma.
    expect(lado({ entryA: 'Tubaroes' }, 'A')).toEqual({ nome: 'Tubaroes' });
  });
});
