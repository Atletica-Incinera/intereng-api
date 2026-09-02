import { ConflictException } from '@nestjs/common';
import { MatchStatus } from '@prisma/client';
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

  describe('trocar o rótulo pela equipe, quando quem decide é uma pessoa', () => {
    /*
     * O mata-mata o app resolve sozinho. Já o grupo de três jogado como
     * mini-chave — "VORAZ × PERDEDOR J3", que a planilha traz dentro da fase
     * de grupos — não segue regra nenhuma que o app conheça.
     *
     * Sem esta troca essas partidas entrariam na agenda e nunca sairiam dela:
     * a mesa não abre partida sem os dois participantes.
     */
    const definir = (
      match: Record<string, unknown>,
      patch: Record<string, unknown>,
      entrada: string | null = 'entrada-voraz',
    ) => {
      const handler = new MatchActionHandler() as unknown as {
        entryByName: unknown;
        participanteDefinido(
          c: unknown,
          m: Record<string, unknown>,
          p: Record<string, unknown>,
        ): Promise<Record<string, string | null>>;
      };
      handler.entryByName = jest.fn().mockResolvedValue(entrada);
      return handler.participanteDefinido(
        { transaction: {} },
        { status: MatchStatus.SCHEDULED, phase: { tournamentId: 'cat-1' }, ...match },
        patch,
      );
    };

    it('define o participante e apaga o rótulo do mesmo lado', async () => {
      await expect(
        definir({ placeholderB: 'Perdedor do Jogo 3' }, { entryB: 'Voraz' }),
      ).resolves.toEqual({ entryBId: 'entrada-voraz', placeholderB: null });
    });

    it('não mexe em nada quando o patch não fala de participante', async () => {
      await expect(definir({}, { venue: 'Ginásio B' })).resolves.toEqual({});
    });

    it('recusa depois que a mesa abriu o placar', async () => {
      // Trocar quem joga a essa altura apagaria o que a mesa anotou.
      await expect(definir({ status: MatchStatus.LIVE }, { entryB: 'Voraz' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('recusa deixar a equipe jogando contra si mesma', async () => {
      await expect(definir({ entryAId: 'entrada-voraz' }, { entryB: 'Voraz' })).rejects.toThrow(
        /diferentes/,
      );
    });
  });

  describe('posição na chave, lida do próprio id', () => {
    const posicao = (id: string, torneio: string) =>
      (
        new MatchActionHandler() as unknown as {
          posicaoNaChave(i: string, t: string): Record<string, number>;
        }
      ).posicaoNaChave(id, torneio);

    it('lê rodada e vaga do id que a progressão usa', () => {
      expect(posicao('cat-abc-advanced-r2-1', 'cat-abc')).toEqual({ round: 2, bracketSlot: 1 });
      expect(posicao('cat-abc-advanced-r1-4', 'cat-abc')).toEqual({ round: 1, bracketSlot: 4 });
    });

    it('não inventa posição para partida comum', () => {
      // Sem a vaga, a progressão procuraria os confrontos da rodada por vaga,
      // acharia lista vazia e concluiria que o torneio acabou. Por isso o id
      // do mata-mata é obrigatório para a chave — e proibido para o resto.
      expect(posicao('match-qualquer', 'cat-abc')).toEqual({});
      expect(posicao('cat-abc-advanced-third', 'cat-abc')).toEqual({});
      expect(posicao('outra-cat-advanced-r1-1', 'cat-abc')).toEqual({});
    });

    it('id de categoria com caractere de regex não quebra a leitura', () => {
      expect(posicao('cat.a+b-advanced-r3-2', 'cat.a+b')).toEqual({ round: 3, bracketSlot: 2 });
    });
  });

  it('não transforma nome desconhecido em rótulo', () => {
    // "Tubaroes" sem acento não é um rótulo: é um nome errado, e continua
    // seguindo o caminho de equipe inscrita, onde será recusado por não
    // existir. Sem isso, todo erro de digitação viraria partida fantasma.
    expect(lado({ entryA: 'Tubaroes' }, 'A')).toEqual({ nome: 'Tubaroes' });
  });
});
