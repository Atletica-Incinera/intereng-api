import { Test, TestingModule } from '@nestjs/testing';
import { PublicCacheListener } from './public-cache.listener';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { MatchStatus, EventType } from '@prisma/client';
import { MatchFinishedEvent, MatchEventCreatedEvent } from '../common/events';

describe('PublicCacheListener', () => {
  let listener: PublicCacheListener;
  let prisma: PrismaService;
  let redisClientMock: any;
  let redisMemory: Map<string, string>;

  beforeEach(async () => {
    redisMemory = new Map<string, string>();

    redisClientMock = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisMemory.get(key) || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: string) => {
        redisMemory.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn().mockImplementation((...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (redisMemory.delete(k)) count++;
        }
        return Promise.resolve(count);
      }),
      keys: jest.fn().mockImplementation((pattern: string) => {
        const regexPattern = pattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return Promise.resolve(Array.from(redisMemory.keys()).filter((k) => regex.test(k)));
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicCacheListener,
        {
          provide: PrismaService,
          useValue: {
            match: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getClient: () => redisClientMock,
          },
        },
      ],
    }).compile();

    listener = module.get<PublicCacheListener>(PublicCacheListener);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Cache Invalidation Events', () => {
    const mockMatchDb = {
      id: 'match-123',
      phase: {
        tournament: {
          id: 'tournament-123',
          editionDiscipline: {
            editionId: 'edition-123',
          },
        },
      },
    };

    beforeEach(() => {
      jest.spyOn(prisma.match, 'findUnique').mockResolvedValue(mockMatchDb as any);
      redisMemory.set('edition:edition-123:live', 'some-cached-data');
      redisMemory.set('tournament:tournament-123:bracket', 'some-cached-bracket');
      redisMemory.set('edition:edition-123:schedule:2026-10-13', 'some-cached-schedule');
    });

    it('should invalidate cache when handleMatchFinished is called', async () => {
      const event = new MatchFinishedEvent(
        'match-123',
        'phase-123',
        3,
        1,
        'entry-a',
        MatchStatus.FINISHED,
      );

      await listener.handleMatchFinished(event);

      expect(redisMemory.has('edition:edition-123:live')).toBe(false);
      expect(redisMemory.has('tournament:tournament-123:bracket')).toBe(false);
      expect(redisMemory.has('edition:edition-123:schedule:2026-10-13')).toBe(false);
    });

    it('should invalidate cache when handleMatchEventCreated is called', async () => {
      const event = new MatchEventCreatedEvent(
        'match-123',
        'event-1',
        EventType.GOAL,
        1,
        'entry-a',
        'athlete-1',
        {},
        1,
        0,
      );

      await listener.handleMatchEventCreated(event);

      expect(redisMemory.has('edition:edition-123:live')).toBe(false);
      expect(redisMemory.has('tournament:tournament-123:bracket')).toBe(false);
      expect(redisMemory.has('edition:edition-123:schedule:2026-10-13')).toBe(false);
    });
  });
});
