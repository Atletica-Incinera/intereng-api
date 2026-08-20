import {
  Controller,
  Header,
  Req,
  Sse,
  MessageEvent,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, finalize, interval, map, merge } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RealtimeService } from './realtime.service';
import { SseConnectionLimiter } from './sse-connection-limiter.service';

type RequestWithUser = Request & { user?: { id: string } };

/**
 * Controller responsible for managing real-time connections.
 * It provides SSE (Server-Sent Events) endpoints for clients to listen to live match updates.
 */
@Controller('matches')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly connectionLimiter: SseConnectionLimiter,
  ) {}

  /**
   * Establishes a real-time Server-Sent Events (SSE) stream for a specific match.
   *
   * This endpoint maintains a persistent HTTP connection to stream live match events
   * (e.g. goals, cards, status changes) to clients in real-time.
   *
   * Features:
   * 1. **Replay Mechanism**: If a client reconnects and provides a `Last-Event-ID` header,
   *    the service will replay missed stream events starting from that ID before subscribing
   *    to new events.
   * 2. **Heartbeats**: The backend periodically sends heartbeat messages to keep the
   *    HTTP connection active and prevent intermediate proxies or load balancers from closing the idle connection.
   * 3. **Connection Cleanup**: When the client closes the connection, the subscription is
   *    automatically torn down to prevent memory leaks and release underlying Redis resources.
   *
   * Ao contrário do canal de edição, este é o canal PRIVADO: entrega o payload
   * bruto de cada evento de partida, não um contador de revisão. Por isso exige
   * `Bearer` e conta as conexões por conta, não por IP. Nenhum `EventSource` de
   * navegador manda header, e nenhuma tela do front consome esta rota — quem a
   * usa precisa de um cliente HTTP comum, que é exatamente o público dela
   * (integrações e ferramentas de mesa).
   *
   * @param matchId The unique identifier of the match to stream events for.
   * @param request The Express request object, containing the optional `Last-Event-ID` header.
   * @returns An `Observable` emitting `MessageEvent` objects containing match event details or heartbeats.
   */
  @Sse(':matchId/stream')
  @Header('Content-Type', 'text/event-stream')
  @UseGuards(JwtAuthGuard)
  stream(
    @Param('matchId') matchId: string,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const accountId = request.user?.id;
    if (!accountId) throw new UnauthorizedException('Usuário não autenticado.');

    // Mesma reserva do canal público, com outra chave: o teto por conta segura
    // quem tem token válido e resolve abrir mil conexões.
    const release = this.connectionLimiter.acquireForAccount(accountId);
    request.on('close', release);

    try {
      return this.matchStream(matchId, request).pipe(finalize(release));
    } catch (error) {
      release();
      throw error;
    }
  }

  private matchStream(matchId: string, request: Request): Observable<MessageEvent> {
    const header = request.headers['last-event-id'];
    const lastEventId = this.realtimeService.normalizeLastEventId(
      Array.isArray(header) ? header[0] : header,
    );

    const eventStream$ = this.realtimeService.createStream(matchId, lastEventId).pipe(
      map((event) => ({
        data: event.data,
        id: event.id,
        type: 'match-event',
      })),
    );

    const heartbeat$ = interval(25000).pipe(
      map(() => ({
        data: { type: 'heartbeat' },
      })),
    );

    return merge(eventStream$, heartbeat$);
  }
}
