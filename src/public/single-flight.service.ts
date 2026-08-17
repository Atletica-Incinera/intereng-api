import { Injectable } from '@nestjs/common';

@Injectable()
export class SingleFlightService {
  private flights = new Map<string, Promise<any>>();

  /**
   * Executa a função `fn` sob o padrão Single Flight.
   * Se já houver uma execução em andamento para a mesma chave `key`,
   * retorna a promessa existente, evitando chamadas concorrentes duplicadas.
   */
  async do<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const activeFlight = this.flights.get(key);
    if (activeFlight) {
      return activeFlight;
    }

    const promise = fn().finally(() => {
      this.flights.delete(key);
    });

    this.flights.set(key, promise);
    return promise;
  }
}
