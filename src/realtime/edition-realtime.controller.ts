import { Controller, Header, Logger, MessageEvent, Param, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import {
  EMPTY,
  Observable,
  catchError,
  concat,
  filter,
  from,
  interval,
  map,
  merge,
  of,
  switchMap,
  tap,
} from 'rxjs';
import { EditionRevisionEvent, RedisStreamEvent, RealtimeService } from './realtime.service';

const HEARTBEAT_INTERVAL_MILLISECONDS = 20_000;

@Controller('editions')
export class EditionRealtimeController {
  private readonly logger = new Logger(EditionRealtimeController.name);

  constructor(private readonly realtimeService: RealtimeService) {}

  @Sse(':editionId/stream')
  @Header('Cache-Control', 'no-cache, no-transform')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  stream(@Param('editionId') editionId: string, @Req() request: Request): Observable<MessageEvent> {
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
