import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { setupTestEnv } from './test-setup';
import { resetDb } from './db-utils';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvents, MatchEventCreatedEvent } from '../src/common/events';
import { RedisService } from '../src/common/redis/redis.service';
import http from 'http';
import { AddressInfo } from 'net';

describe('Realtime Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let eventEmitter: EventEmitter2;
  let redisService: RedisService;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    jest.setTimeout(30000);
    setupTestEnv();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    eventEmitter = app.get<EventEmitter2>(EventEmitter2);
    redisService = app.get<RedisService>(RedisService);

    // Clear redis for stream:match:test-match
    await redisService.getClient().del('stream:match:test-match');

    // Start listening on a random port for HTTP tests
    server = app.getHttpServer() as http.Server;
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        port = address && typeof address !== 'string' ? address.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
  });

  it('should stream real-time events when domain events are emitted', async () => {
    const matchId = 'test-match';

    // 1. Connect to SSE stream
    const req = http.request({
      hostname: 'localhost',
      port,
      path: `/api/v1/matches/${matchId}/stream`,
      method: 'GET',
    });

    const receivedChunks: string[] = [];
    const responsePromise = new Promise<void>((resolve, reject) => {
      req.on('response', (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');

        res.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          receivedChunks.push(chunkStr);
          if (chunkStr.includes('match-event')) {
            resolve();
          }
        });

        res.on('error', reject);
      });

      req.on('error', reject);
    });

    req.end();

    // Give SSE connection some time to establish
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 2. Emit the domain event which should trigger XADD
    const eventPayload: MatchEventCreatedEvent = {
      matchId,
      eventId: 'event-1',
      type: 'GOAL',
      sequence: 1,
      entryId: 'entry-a',
      athleteId: 'athlete-1',
      metadata: { minute: 10 },
      scoreA: 1,
      scoreB: 0,
    };

    await eventEmitter.emitAsync(DomainEvents.MATCH_EVENT_CREATED, eventPayload);

    // 3. Wait for the chunk to be received
    await responsePromise;

    // 4. Abort the request (disconnect client)
    req.destroy();

    // Verify received event content
    const fullOutput = receivedChunks.join('');
    expect(fullOutput).toContain('event: match-event');
    expect(fullOutput).toContain('"eventId":"event-1"');
    expect(fullOutput).toContain('"type":"GOAL"');
    expect(fullOutput).toContain('"scoreA":1');
  });

  it('should replay missed events when Last-Event-ID is provided', async () => {
    const matchId = 'test-match';

    // 1. Manually add a couple of events to the Redis stream using Redis client directly
    const redisClient = redisService.getClient();
    const streamKey = `stream:match:${matchId}`;

    // Clear first
    await redisClient.del(streamKey);

    const fields1 = [
      'eventId',
      'event-1',
      'type',
      'GOAL',
      'sequence',
      '1',
      'entryId',
      'entry-a',
      'athleteId',
      'athlete-1',
      'metadata',
      JSON.stringify({ minute: 10 }),
      'scoreA',
      '1',
      'scoreB',
      '0',
    ];
    const fields2 = [
      'eventId',
      'event-2',
      'type',
      'YELLOW_CARD',
      'sequence',
      '2',
      'entryId',
      'entry-b',
      'athleteId',
      'athlete-2',
      'metadata',
      JSON.stringify({ minute: 20 }),
      'scoreA',
      '1',
      'scoreB',
      '0',
    ];

    const id1 = await redisClient.xadd(streamKey, '*', ...fields1);
    const id2 = await redisClient.xadd(streamKey, '*', ...fields2);

    // 2. Connect with Last-Event-ID header set to id1
    const req = http.request({
      hostname: 'localhost',
      port,
      path: `/api/v1/matches/${matchId}/stream`,
      method: 'GET',
      headers: {
        'last-event-id': id1,
      },
    });

    const receivedChunks: string[] = [];
    const responsePromise = new Promise<void>((resolve, reject) => {
      req.on('response', (res) => {
        expect(res.statusCode).toBe(200);

        res.on('data', (chunk: Buffer) => {
          const chunkStr = chunk.toString();
          receivedChunks.push(chunkStr);
          // Once we have received event-2, resolve
          if (chunkStr.includes('event-2')) {
            resolve();
          }
        });

        res.on('error', reject);
      });

      req.on('error', reject);
    });

    req.end();

    // 3. Wait for the chunk containing event-2 to be received via replay
    await responsePromise;

    // 4. Clean up
    req.destroy();

    const fullOutput = receivedChunks.join('');
    // It should contain event-2
    expect(fullOutput).toContain('event: match-event');
    expect(fullOutput).toContain(`id: ${id2}`);
    expect(fullOutput).toContain('"eventId":"event-2"');

    // It should NOT contain event-1 because the client requested events AFTER id1
    expect(fullOutput).not.toContain('"eventId":"event-1"');
  });
});
