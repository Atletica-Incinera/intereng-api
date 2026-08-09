import { Controller, Header, Req, Sse, MessageEvent, Param } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { RealtimeService } from './realtime.service';

/**
 * Controller responsible for managing real-time connections.
 * It provides SSE (Server-Sent Events) endpoints for clients to listen to live match updates.
 */
@Controller('matches')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  // Duplicate import removed

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
   * @param matchId The unique identifier of the match to stream events for.
   * @param request The Express request object, containing the optional `Last-Event-ID` header.
   * @returns An `Observable` emitting `MessageEvent` objects containing match event details or heartbeats.
   */
  @Sse(':matchId/stream')
  @Header('Content-Type', 'text/event-stream')
  stream(@Param('matchId') matchId: string, @Req() request: Request): Observable<MessageEvent> {
    const lastEventId = request.headers['last-event-id'] as string | undefined;
    return this.realtimeService.createStream(matchId, lastEventId);
  }
}
