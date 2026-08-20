import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { env } from '../common/config/env';
import { resolveClientIp } from '../common/guards/client-ip';

/**
 * Teto de conexões SSE simultâneas.
 *
 * Cada conexão de tempo real mantém um cliente Redis duplicado bloqueado em
 * XREAD (veja `RealtimeService.createRedisStream`). Ou seja: o número de
 * conexões abertas é também o número de sockets Redis e de descritores do
 * processo. Sem teto, qualquer pessoa derruba o tempo real do evento inteiro
 * abrindo conexões em série — é o ataque mais barato que existe contra esta API.
 *
 * Os números padrão:
 *
 * - GLOBAL (800): folga confortável sob o `maxclients` padrão do Redis (10 mil)
 *   e sob o limite de descritores de um processo Node comum, e ainda assim
 *   muito acima do público esperado do evento. Estourar aqui é sinal de ataque
 *   ou de vazamento de conexões, não de sucesso de audiência.
 * - POR IP (40): o canal público é anônimo, então a única chave disponível é a
 *   origem. Um navegador abre no máximo ~6 conexões por origem em HTTP/1.1, e o
 *   front compartilha um EventSource por aba; 40 comporta várias abas e vários
 *   aparelhos saindo do mesmo NAT (o wi-fi do campus é um IP só para muita
 *   gente) sem deixar um cliente sozinho tomar mais de 5% do teto global.
 * - POR CONTA (10): o canal privado é por partida e um mesário acompanha uma de
 *   cada vez; 10 cobre abas duplicadas e reconexões que ainda não expiraram.
 *
 * Os três são ajustáveis por variável de ambiente porque, no dia do evento,
 * subir um teto não pode depender de deploy.
 */
@Injectable()
export class SseConnectionLimiter {
  private readonly logger = new Logger(SseConnectionLimiter.name);
  private readonly maxGlobal = env.positiveInteger('REALTIME_SSE_MAX_GLOBAL', 800);
  private readonly maxPerIp = env.positiveInteger('REALTIME_SSE_MAX_PER_IP', 40);
  private readonly maxPerAccount = env.positiveInteger('REALTIME_SSE_MAX_PER_ACCOUNT', 10);
  private readonly counters = new Map<string, number>();
  private total = 0;

  /** Canal público: sem conta para contar, sobra a origem da requisição. */
  acquireForOrigin(request: Parameters<typeof resolveClientIp>[0]): () => void {
    return this.acquire(`ip:${resolveClientIp(request)}`, this.maxPerIp, 'desta origem');
  }

  /** Canal autenticado: a conta é a chave, independente de quantos IPs use. */
  acquireForAccount(accountId: string): () => void {
    return this.acquire(`conta:${accountId}`, this.maxPerAccount, 'desta conta');
  }

  get activeConnections(): number {
    return this.total;
  }

  activeConnectionsFor(key: string): number {
    return this.counters.get(key) ?? 0;
  }

  private acquire(key: string, maxPerKey: number, origem: string): () => void {
    if (this.total >= this.maxGlobal) {
      this.logger.warn(
        `Teto global de conexões de tempo real atingido (${this.maxGlobal}); recusando ${key}.`,
      );
      throw new HttpException(
        'O canal de tempo real está no limite de conexões simultâneas. Tente novamente em instantes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const current = this.counters.get(key) ?? 0;
    if (current >= maxPerKey) {
      throw new HttpException(
        `Há conexões de tempo real demais abertas ${origem}. Feche as abas em excesso e tente novamente.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.counters.set(key, current + 1);
    this.total += 1;

    // Idempotente de propósito: a liberação é chamada tanto pelo `finalize` do
    // Observable quanto pelo `close` da requisição, e as duas coisas acontecem
    // na queda normal de um cliente. Contar duas vezes zeraria o teto.
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total -= 1;
      const remaining = (this.counters.get(key) ?? 1) - 1;
      if (remaining <= 0) this.counters.delete(key);
      else this.counters.set(key, remaining);
    };
  }
}
