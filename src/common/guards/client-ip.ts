/**
 * IP real de quem fez a requisição, atrás do nginx.
 *
 * O app é criado sem `trust proxy`, então `request.ip` devolve o IP do proxy —
 * e qualquer contagem por origem passaria a tratar a internet inteira como um
 * cliente só, limitando todo mundo junto. Por isso a leitura é feita aqui, no
 * mesmo lugar para o throttler e para o teto de conexões SSE.
 *
 * A entrada lida é contada a partir do FIM do `X-Forwarded-For`, não do começo:
 * o nginx da produção usa `$proxy_add_x_forwarded_for`, que ANEXA o peer
 * imediato ao fim do header. Quem enviar `X-Forwarded-For: 1.2.3.4` só empurra
 * lixo para a esquerda; o valor acrescentado pelo proxy continua sendo o último.
 *
 * Quantos saltos pular vem de `TRUSTED_PROXY_HOPS` porque errar isso não dá
 * erro: com um proxy a mais na frente, a última entrada vira o IP do proxy
 * interno e TODOS os espectadores anônimos colapsam num balde só — o teto por
 * IP viraria um teto global, na noite do evento, sem nada no log dizendo o
 * porquê. Sendo variável de ambiente, quem estiver de plantão conserta sem
 * esperar um deploy.
 */
type IpBearingRequest = {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

const UNKNOWN_IP = 'desconhecido';

/** Proxies confiáveis entre o cliente e a API. Um, hoje: o `incinera-gateway`. */
export function trustedProxyHops(): number {
  const configured = Number(process.env.TRUSTED_PROXY_HOPS);
  return Number.isInteger(configured) && configured > 0 ? configured : 1;
}

function normalize(address: string): string {
  const trimmed = address.trim().toLowerCase();
  // IPv4 encapsulado em IPv6 (`::ffff:10.0.0.1`) chega assim quando o Node
  // aceita conexões em dual stack; sem normalizar, o mesmo cliente ocuparia
  // dois baldes diferentes.
  const withoutV6Prefix = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  return withoutV6Prefix || UNKNOWN_IP;
}

export function resolveClientIp(request: IpBearingRequest): string {
  const header = request.headers?.['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;

  if (typeof raw === 'string') {
    const entries = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    // `length - hops` e não `length - 1`: com dois proxies, o último é o interno.
    const nearest = entries[entries.length - trustedProxyHops()];
    if (nearest) return normalize(nearest);
  }

  return normalize(request.ip ?? request.socket?.remoteAddress ?? UNKNOWN_IP);
}
