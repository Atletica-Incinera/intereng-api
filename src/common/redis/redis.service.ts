import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  /**
   * Ping the Redis server.
   * @returns PONG if successful.
   */
  async ping(): Promise<string> {
    return this.redisClient.ping();
  }

  /**
   * Get the underlying ioredis client.
   */
  getClient(): Redis {
    return this.redisClient;
  }

  /**
   * Close the connection when module is destroyed.
   */
  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
