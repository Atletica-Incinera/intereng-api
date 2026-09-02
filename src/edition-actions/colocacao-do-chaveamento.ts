/**
 * Os rótulos do chaveamento publicado, e o que cada um quer dizer.
 *
 * A organização monta a chave à mão numa planilha e publica assim: "1º GRUPO
 * A x MELHOR TERCEIRO COLOCADO". Esse cruzamento é uma decisão dela — não sai
 * de nenhuma regra de semeadura.
 *
 * O app semeia sozinho quando não lhe dizem nada (o 1º geral contra o último
 * classificado, o 2º contra o penúltimo). Para o Futsal Masculino de 2026 isso
 * dá uma chave DIFERENTE da publicada: o app cruzaria 1ºA com o 2º melhor
 * terceiro e 1ºC com o 2ºC, onde a planilha cruza 1ºA com o melhor terceiro e
 * 1ºC com o 2ºA. Sem ler os rótulos, a chave que o público viu durante a fase
 * de grupos seria trocada por outra assim que ela acabasse.
 *
 * Daí este arquivo: o que estiver escrito na chave é o que vale.
 *
 * A mesma gramática existe no importador do front (`importar-chaveamento.mjs`),
 * que recusa aplicar uma planilha com rótulo que aqui não seria entendido. São
 * repositórios separados; a checagem no importador é o que impede a divergência
 * de aparecer só no dia do evento.
 */

export type Colocacao =
  { tipo: 'grupo'; grupo: string; posicao: number } | { tipo: 'melhor-terceiro'; posicao: number };

const ORDINAIS: Record<string, number> = {
  PRIMEIRO: 1,
  SEGUNDO: 2,
  TERCEIRO: 3,
  QUARTO: 4,
};

/** Sem acento, sem "º", em caixa alta e com um espaço só entre as palavras. */
export function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[º°ª]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** O nome do grupo aparece ora como "A", ora como "GRUPO A". */
export function nomeDoGrupo(valor: string): string {
  return normalizar(valor).replace(/^GRUPO\s+/, '');
}

export function lerColocacao(rotulo: string): Colocacao | null {
  const texto = normalizar(rotulo);
  if (!texto) return null;

  /*
   * Os terceiros vêm primeiro: "MELHOR TERCEIRO COLOCADO" também casaria com a
   * forma "MELHOR <grupo>", e viraria uma busca pelo grupo "TERCEIRO COLOCADO".
   */
  const terceiro =
    /^(?:(\d+)|(PRIMEIRO|SEGUNDO|TERCEIRO|QUARTO))?\s*MELHOR(?:ES)? TERCEIROS?(?: COLOCADOS?)?$/.exec(
      texto,
    );
  if (terceiro) {
    const posicao = terceiro[1] ? Number(terceiro[1]) : (ORDINAIS[terceiro[2] ?? ''] ?? 1);
    return posicao > 0 ? { tipo: 'melhor-terceiro', posicao } : null;
  }

  // "1 GRUPO A", "2 GRUPO B"
  const porNumero = /^(\d+) GRUPO (.+)$/.exec(texto);
  if (porNumero) {
    const posicao = Number(porNumero[1]);
    return posicao > 0 ? { tipo: 'grupo', grupo: nomeDoGrupo(porNumero[2]), posicao } : null;
  }

  // "MELHOR CLASSIFICADO A", "SEGUNDO MELHOR B", "SEGUNDO MELHOR CLASSIFICADO DO GRUPO C"
  const porAdjetivo =
    /^(?:(PRIMEIRO|SEGUNDO|TERCEIRO|QUARTO) )?MELHOR(?: CLASSIFICADO)?(?: DO)?(?: GRUPO)? (.+)$/.exec(
      texto,
    );
  if (porAdjetivo) {
    return {
      tipo: 'grupo',
      grupo: nomeDoGrupo(porAdjetivo[2]),
      posicao: ORDINAIS[porAdjetivo[1] ?? 'PRIMEIRO'] ?? 1,
    };
  }

  return null;
}

/** O rótulo aponta para um jogo anterior, não para a classificação dos grupos. */
export function dependeDeOutroJogo(rotulo: string): boolean {
  return /^(VENCEDOR|PERDEDOR)\b/.test(normalizar(rotulo));
}
