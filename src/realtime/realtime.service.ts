import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, map, share } from 'rxjs';
import { env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import { getEditionStreamKey, getStreamKey } from './constants';
import { RedisStreamSerializer } from './redis-stream-serializer';

const STREAM_READ_COUNT = 100;
const STREAM_BLOCK_MILLISECONDS = 20_000;
const EDITION_STREAM_MAX_LENGTH = 1_000;
const REDIS_EVENT_ID_PATTERN = /^\d+-\d+$/;

export interface EditionRevisionEvent {
  editionId: string;
  revision: number;
}

export interface RedisStreamEvent<T> {
  id: string;
  data: T;
}

export interface EditionStreamContext {
  routeEditionId: string;
  streamEditionId: string;
  editionId: string;
  revision: number;
  cursor: string;
}

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly streamTtlSeconds = env.positiveInteger('REDIS_STREAM_TTL', 3_600);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly snapshots: EditionSnapshotsService,
  ) {}

  async prepareEditionStream(
    editionId: string,
    lastEventId?: string,
  ): Promise<EditionStreamContext> {
    const streamEditionId = editionId === 'active' ? 'active' : editionId;
    const cursor =
      this.normalizeLastEventId(lastEventId) ??
      (await this.latestStreamId(
        this.redisService.getClient(),
        getEditionStreamKey(streamEditionId),
      ));
    const revision = await this.resolveEditionRevision(editionId);
    return {
      routeEditionId: editionId,
      streamEditionId,
      editionId: revision.editionId,
      revision: revision.revision,
      cursor,
    };
  }

  async resolveEditionRevision(editionId: string): Promise<EditionRevisionEvent> {
    const edition = await this.prisma.$transaction((transaction) =>
      this.snapshots.resolveEditionInTransaction(transaction, editionId),
    );
    return { editionId: edition.id, revision: edition.revision };
  }

  normalizeLastEventId(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (!REDIS_EVENT_ID_PATTERN.test(normalized)) {
      throw new BadRequestException('O header Last-Event-ID possui um formato inválido.');
    }
    return normalized;
  }

  createEditionStream(
    editionId: string,
    lastEventId?: string,
  ): Observable<RedisStreamEvent<EditionRevisionEvent>> {
    return this.createRedisStream(
      getEditionStreamKey(editionId),
      this.normalizeLastEventId(lastEventId),
    ).pipe(map((event) => ({ id: event.id, data: this.editionRevisionEvent(event.data) })));
  }

  createStream(
    matchId: string,
    lastEventId?: string,
  ): Observable<RedisStreamEvent<Record<string, unknown>>> {
    return this.createRedisStream(getStreamKey(matchId), this.normalizeLastEventId(lastEventId));
  }

  async publishEditionRevision(event: EditionRevisionEvent): Promise<void> {
    const streamKeys = [getEditionStreamKey(event.editionId), getEditionStreamKey('active')];
    const transaction = this.redisService.getClient().multi();
    for (const streamKey of streamKeys) {
      transaction
        .xadd(
          streamKey,
          'MAXLEN',
          '~',
          EDITION_STREAM_MAX_LENGTH,
          '*',
          'editionId',
          event.editionId,
          'revision',
          event.revision,
        )
        .expire(streamKey, this.streamTtlSeconds);
    }
    const result = await transaction.exec();
    if (!result) throw new Error('O Redis não confirmou a publicação da revisão.');
    const failedCommand = result.find(([error]) => error !== null);
    if (failedCommand?.[0]) throw failedCommand[0];
  }

  async setStreamTTL(matchId: string, ttlSeconds = this.streamTtlSeconds): Promise<void> {
    await this.redisService.getClient().expire(getStreamKey(matchId), ttlSeconds);
  }

  async publishMatchEvent(matchId: string, event: Record<string, unknown>): Promise<void> {
    const fields = RedisStreamSerializer.serialize(event);
    await this.redisService.getClient().xadd(getStreamKey(matchId), '*', ...fields);
  }

  private createRedisStream(
    streamKey: string,
    lastEventId?: string,
  ): Observable<RedisStreamEvent<Record<string, unknown>>> {
    const client = this.redisService.getClient();
    return new Observable<RedisStreamEvent<Record<string, unknown>>>((subscriber) => {
      const blockingClient = client.duplicate();
      let active = true;

      const onError = (error: Error) => {
        if (!subscriber.closed) subscriber.error(error);
      };
      blockingClient.on('error', onError);

      const run = async () => {
        try {
          let cursor = lastEventId ?? (await this.latestStreamId(client, streamKey));
          while (active && !subscriber.closed) {
            const result = await blockingClient.xread(
              'COUNT',
              STREAM_READ_COUNT,
              'BLOCK',
              STREAM_BLOCK_MILLISECONDS,
              'STREAMS',
              streamKey,
              cursor,
            );
            if (!result) continue;
            for (const [, messages] of result) {
              for (const [messageId, fields] of messages) {
                if (!active || subscriber.closed) return;
                subscriber.next({
                  id: messageId,
                  data: RedisStreamSerializer.deserialize(fields),
                });
                cursor = messageId;
              }
            }
          }
        } catch (error: unknown) {
          if (!subscriber.closed) subscriber.error(error);
        }
      };
      void run();

      return () => {
        active = false;
        blockingClient.removeListener('error', onError);
        blockingClient.disconnect();
      };
    }).pipe(share());
  }

  private async latestStreamId(client: Redis, streamKey: string): Promise<string> {
    const latest = await client.xrevrange(streamKey, '+', '-', 'COUNT', 1);
    return latest[0]?.[0] ?? '0-0';
  }

  private editionRevisionEvent(data: Record<string, unknown>): EditionRevisionEvent {
    const editionId = data.editionId;
    const revision = data.revision;
    if (
      typeof editionId !== 'string' ||
      !editionId ||
      typeof revision !== 'number' ||
      !Number.isInteger(revision) ||
      revision < 0
    ) {
      this.logger.error('O Redis Stream contém um evento de revisão inválido.');
      throw new Error('O evento de revisão armazenado é inválido.');
    }
    return { editionId, revision };
  }
}
