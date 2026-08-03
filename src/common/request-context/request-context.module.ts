/**
 * @fileoverview Global NestJS module configuring AsyncLocalStorage request context.
 */

import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { RequestContextMiddleware } from './request-context.middleware';

/**
 * Global module providing and exporting RequestContextService.
 *
 * Configures the `RequestContextMiddleware` globally so that it runs for all incoming routes (`*`),
 * initializing the request context early in the request execution cycle.
 */
@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule implements NestModule {
  /**
   * Registers the request-scoped tracking middleware for all endpoints.
   *
   * @param consumer - Middleware registration consumer.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
