/**
 * @fileoverview AsyncLocalStorage instance to manage request-scoped data.
 *
 * This storage enables tracing context across asynchronous execution flows in the request life cycle,
 * allowing logs and downstream services to access request metadata (like requestId) without explicit prop passing.
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * Structure of the metadata stored in the request context.
 */
export interface RequestContextStore {
  /**
   * The unique tracing identifier for the current request.
   */
  requestId: string;
}

/**
 * Global instance of AsyncLocalStorage used to maintain request context
 * across asynchronous execution boundaries.
 */
export const requestContextStorage =
  new AsyncLocalStorage<RequestContextStore>();
