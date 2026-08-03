import { Module, DynamicModule, Global, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT, REDIS_OPTIONS } from './redis.constants';
import {
  RedisModuleAsyncOptions,
  RedisModuleOptions,
  RedisOptionsFactory,
} from './redis.interfaces';

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    const redisOptionsProvider: Provider = {
      provide: REDIS_OPTIONS,
      useValue: options,
    };

    const redisClientProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: (opts: RedisModuleOptions) => {
        return new Redis(opts.url);
      },
      inject: [REDIS_OPTIONS],
    };

    return {
      module: RedisModule,
      providers: [redisOptionsProvider, redisClientProvider, RedisService],
      exports: [redisClientProvider, RedisService],
    };
  }

  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
    const asyncProviders = this.createAsyncProviders(options);

    const redisClientProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: (opts: RedisModuleOptions) => {
        return new Redis(opts.url);
      },
      inject: [REDIS_OPTIONS],
    };

    return {
      module: RedisModule,
      imports: options.imports || [],
      providers: [...asyncProviders, redisClientProvider, RedisService],
      exports: [redisClientProvider, RedisService],
    };
  }

  private static createAsyncProviders(options: RedisModuleAsyncOptions): Provider[] {
    if (options.useFactory) {
      return [
        {
          provide: REDIS_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
      ];
    }

    if (options.useClass || options.useExisting) {
      const inject = [(options.useClass || options.useExisting)!];
      return [
        {
          provide: REDIS_OPTIONS,
          useFactory: async (optionsFactory: RedisOptionsFactory) =>
            optionsFactory.createRedisOptions(),
          inject,
        },
        ...(options.useClass
          ? [
              {
                provide: options.useClass,
                useClass: options.useClass,
              },
            ]
          : []),
      ];
    }

    throw new Error(
      'Invalid RedisModuleAsyncOptions: useFactory, useClass, or useExisting must be provided',
    );
  }
}
