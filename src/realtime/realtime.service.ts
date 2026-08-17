import { Injectable } from '@nestjs/common';
import { getStreamKey } from './constants';
import { Observable } from 'rxjs';
import { RedisService } from '../common/redis/redis.service';
import { share } from 'rxjs';
import { RedisStreamSerializer } from './redis-stream-serializer';

/**
 * Service responsible for real‑time SSE streams and propagating match events
 * to Redis streams. It coordinates domain event handling, stream creation,
 * and TTL management while delegating Redis client access to a private
 * helper to keep responsibilities focused.
 */
@Injectable()
export class RealtimeService {
  constructor(private readonly redisService: RedisService) {}

  /**
   * Parses a flat array of Redis stream fields into a key/value object.
   * @param fields Array of alternating keys and values.
   * @returns Record with field names as keys and their values.
   */
  private parseFields(fields: string[]): Record<string, any> {
    return RedisStreamSerializer.deserialize(fields);
  }

  /**
   * Creates an Observable that streams raw match events from the Redis Stream.
   * It reads past events (if `lastEventId` is provided) and then continuously reads from the
   * Redis Stream using `XREAD`. The observable is shared among subscribers.
   *
   * @param matchId Identifier of the match whose events are streamed.
   * @param lastEventId Optional ID of the last event the client has received; if omitted the
   *                    stream starts from the newest entry (`$`).
   * @returns An {@link Observable} emitting raw Redis stream messages containing id and data.
   * @throws Propagates any error thrown by the underlying Redis client during reading.
   */
  createStream(
    matchId: string,
    lastEventId?: string,
  ): Observable<{ id: string; data: Record<string, any> }> {
    const client = this.redisService.getClient();
    const streamKey = getStreamKey(matchId);
    const startId = lastEventId ?? '$';
    const maxEvents = 6;
    const observable = new Observable<{ id: string; data: Record<string, any> }>((subscriber) => {
      let currentId = startId;
      // Duplicate client to prevent blocking other commands on the shared connection
      const blockingClient = client.duplicate();

      blockingClient.on('error', (err) => {
        if (!subscriber.closed) {
          subscriber.error(err);
        }
      });

      const emitMessage = (msgId: string, fields: string[]) => {
        const data = this.parseFields(fields);
        subscriber.next({ id: msgId, data });
        currentId = msgId;
      };

      const readPast = async () => {
        if (lastEventId && lastEventId !== '$') {
          // Replay missed events using XRANGE
          const past = await client.xrange(streamKey, lastEventId, '+');
          for (const [msgId, fields] of past) {
            // Skip the very last event if it's identical to lastEventId to avoid duplicate delivery
            if (msgId === lastEventId) {
              continue;
            }
            emitMessage(msgId, fields);
          }
        }
      };

      const readLoop = async () => {
        try {
          const result = await blockingClient.xread(
            'COUNT',
            maxEvents,
            'BLOCK',
            0,
            'STREAMS',
            streamKey,
            currentId,
          );
          if (subscriber.closed) {
            return;
          }
          if (!result) {
            return readLoop();
          }
          const [, messages] = result[0];
          let sent = 0;
          for (const [msgId, fields] of messages) {
            if (sent >= maxEvents) {
              break;
            }
            emitMessage(msgId, fields);
            sent++;
          }
          // Continue reading after a short async tick
          setTimeout(() => {
            if (!subscriber.closed) {
              void readLoop();
            }
          }, 0);
        } catch (err) {
          if (!subscriber.closed) {
            subscriber.error(err);
          }
        }
      };

      // Initialize flow
      void (async () => {
        try {
          await readPast();
          if (!subscriber.closed) {
            void readLoop();
          }
        } catch (err) {
          if (!subscriber.closed) {
            subscriber.error(err);
          }
        }
      })();

      // Cleanup on unsubscribe
      return () => {
        // Disconnect the duplicated blocking connection immediately to release resources
        blockingClient.disconnect();
      };
    }).pipe(share());
    return observable;
  }

  /**
   * Sets an expiration time (TTL) for a match's Redis Stream.
   * This should be called when the match is finished to allow the stream to be
   * automatically cleaned up by Redis.
   *
   * @param matchId Identifier of the match/stream.
   * @param ttlSeconds Time‑to‑live in seconds; defaults to the value of
   *                   `REDIS_STREAM_TTL` env var or 3600 seconds (1 hour).
   */
  async setStreamTTL(
    matchId: string,
    ttlSeconds: number = Number(process.env.REDIS_STREAM_TTL ?? 3600),
  ): Promise<void> {
    const client = this.redisService.getClient();
    const streamKey = getStreamKey(matchId);
    await client.expire(streamKey, ttlSeconds);
  }

  /**
   * Publishes a match event to the Redis Stream scoped for the given match.
   * Serializes the event fields before appending it.
   *
   * @param matchId Identifier of the match.
   * @param event The event payload containing details of the match event.
   */
  async publishMatchEvent(matchId: string, event: Record<string, any>): Promise<void> {
    const client = this.redisService.getClient();
    const streamKey = getStreamKey(matchId);
    const fields = RedisStreamSerializer.serialize(event);
    await client.xadd(streamKey, '*', ...fields);
  }
}
