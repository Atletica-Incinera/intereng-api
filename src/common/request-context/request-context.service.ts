/**
 * @fileoverview Service to retrieve request-scoped metadata from storage.
 */

import { Injectable } from '@nestjs/common';
import { requestContextStorage } from './request-context.storage';

/**
 * Injectable service that acts as an access interface for the current request context.
 *
 * Allows any NestJS service or interceptor to safely fetch metadata about the current
 * execution flow, such as the correlation/request ID, without depending directly
 * on global express objects.
 */
@Injectable()
export class RequestContextService {
  /**
   * Retrieves the tracing request identifier for the current asynchronous execution context.
   *
   * @returns The request ID if called within a request execution boundary; otherwise undefined.
   */
  getRequestId(): string | undefined {
    return requestContextStorage.getStore()?.requestId;
  }
}
