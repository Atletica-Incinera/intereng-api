import { Injectable } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { RedisService } from './common/redis/redis.service';

export interface HealthStatus {
  status: 'ok';
  service: 'intereng-api';
  dependencies: {
    database: 'ok';
    redis: 'ok';
  };
  timestamp: string;
}

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getHealth(): Promise<HealthStatus> {
    await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    return {
      status: 'ok',
      service: 'intereng-api',
      dependencies: { database: 'ok', redis: 'ok' },
      timestamp: new Date().toISOString(),
    };
  }
}
