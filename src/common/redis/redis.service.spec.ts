import { Test, TestingModule } from '@nestjs/testing';
import { RedisModule } from './redis.module';
import { RedisService } from './redis.service';

describe('RedisService (Integration)', () => {
  let service: RedisService;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        RedisModule.forRootAsync({
          useFactory: () => ({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
          }),
        }),
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should ping Redis and return PONG', async () => {
    const result = await service.ping();
    expect(result).toBe('PONG');
  });
});
