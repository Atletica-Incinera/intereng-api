import { Controller, Header, Logger, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import {
  EMPTY,
  Observable,
  catchError,
  concat,
  filter,
  finalize,
  from,
  interval,
  map,
  merge,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { EditionRevisionEvent, RedisStreamEvent, RealtimeService } from './realtime.service';
import { SseConnectionLimiter } from './sse-connection-limiter.service';

const HEARTBEAT_INTERVAL_MILLISECONDS = 20_000;

/**
 * Canal público de invalidação da edição.
 *
 * Segue aberto a quem não está autenticado de propósito: o espectador do
 * ginásio precisa ver o placar mudar sozinho, e o que trafega aqui é apenas
 * `{ editionId, revision }` — um contador. Nenhum dado da edição passa pelo
 * stream; quem recebe a revisão vai buscar o snapshot pela rota que a sua
 * sessão (ou a falta dela) permite. Exigir token aqui quebraria o público sem
 * esconder nada, porque a revisão não diz o que mudou.
 *
 * O que protege o processo, então, é teto: por origem e global.
 */
@Controller('editions')
export class EditionRealtimeController {
  private readonly logger = new Logger(EditionRealtimeController.name);

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly connectionLimiter: SseConnectionLimiter,
  ) {}

  @Sse(':editionId/stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(@Param('editionId') editionId: string, @Req() request: Request): Observable<MessageEvent> {
    // Reservar a vaga antes de montar o stream: estourar o teto precisa virar
    // uma resposta 429, não um stream que abre e morre logo depois.
    const release = this.connectionLimiter.acquireForOrigin(request);
    // A queda de rede nem sempre chega como unsubscribe imediato; o `close` da
    // requisição chega sempre. A liberação é idempotente, então os dois podem
    // acontecer.
    request.on('close', release);

    try {
      return this.editionStream(editionId, request).pipe(finalize(release));
    } catch (error) {
      release();
      throw error;
    }
  }

  private editionStream(editionId: string, request: Request): Observable<MessageEvent> {
    const header = request.headers['last-event-id'];
    const lastEventId = this.realtimeService.normalizeLastEventId(
      Array.isArray(header) ? header[0] : header,
    );
    return from(this.realtimeService.prepareEditionStream(editionId, lastEventId)).pipe(
      switchMap((context) => {
        let cursor = context.cursor;
        let currentRevision: EditionRevisionEvent = {
          editionId: context.editionId,
          revision: context.revision,
        };
        const baseline = of(this.revisionMessage(cursor, currentRevision));
        const revisions = this.realtimeService
          .createEditionStream(context.streamEditionId, cursor)
          .pipe(
            tap((event) => {
              cursor = event.id;
            }),
            switchMap((event) => this.resolveStreamEvent(context.routeEditionId, event)),
            filter((event) => this.shouldEmitRevision(currentRevision, event.data)),
            tap((event) => {
              currentRevision = event.data;
            }),
            map((event) => this.revisionMessage(event.id, event.data)),
          );
        const reconciliation = interval(HEARTBEAT_INTERVAL_MILLISECONDS).pipe(
          switchMap(() =>
            from(this.realtimeService.resolveEditionRevision(context.routeEditionId)).pipe(
              map((revision): MessageEvent => {
                if (this.shouldEmitRevision(currentRevision, revision)) {
                  currentRevision = revision;
                  return this.revisionMessage(cursor, revision);
                }
                return this.heartbeatMessage(cursor, currentRevision.editionId);
              }),
              catchError((error: unknown) => {
                this.logReconciliationFailure(context.routeEditionId, error);
                return of(this.heartbeatMessage(cursor, currentRevision.editionId));
              }),
            ),
          ),
        );
        return concat(baseline, merge(revisions, reconciliation));
      }),
    );
  }

  private resolveStreamEvent(
    routeEditionId: string,
    event: RedisStreamEvent<EditionRevisionEvent>,
  ): Observable<RedisStreamEvent<EditionRevisionEvent>> {
    if (routeEditionId !== 'active') return of(event);
    return from(this.realtimeService.resolveEditionRevision('active')).pipe(
      map((revision) => ({ id: event.id, data: revision })),
      catchError((error: unknown) => {
        this.logReconciliationFailure(routeEditionId, error);
        return EMPTY;
      }),
    );
  }

  private shouldEmitRevision(
    current: EditionRevisionEvent,
    candidate: EditionRevisionEvent,
  ): boolean {
    if (candidate.editionId !== current.editionId) return true;
    return candidate.revision > current.revision;
  }

  private revisionMessage(id: string, revision: EditionRevisionEvent): MessageEvent {
    return { id, type: 'edition-revision', data: revision };
  }

  private heartbeatMessage(id: string, editionId: string): MessageEvent {
    return {
      id,
      type: 'heartbeat',
      data: { editionId, at: new Date().toISOString() },
    };
  }

  private logReconciliationFailure(routeEditionId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    this.logger.warn(
      `Não foi possível reconciliar a revisão da edição ${routeEditionId}: ${message}`,
    );
  }
}
