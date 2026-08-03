/**
 * @fileoverview Middleware to initialize the AsyncLocalStorage request context.
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { requestContextStorage } from './request-context.storage';
import { getOrCreateRequestId } from './request-context.utils';

/**
 * Middleware that intercepts incoming HTTP requests and wraps their execution flow
 * within an AsyncLocalStorage context run boundary.
 *
 * Flow description:
 * 1. Executes before NestJS guards, interceptors, and route handlers.
 * 2. Extracts or generates a unique tracking ID using `getOrCreateRequestId`.
 * 3. Sets the ID on request/response headers.
 * 4. Calls `requestContextStorage.run()` to bind the context, ensuring all downstream
 *    asynchronous operations, log entries, and db calls executing in the same request thread
 *    can read this unique `requestId` without prop drilling.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  /**
   * Main middleware entry point.
   *
   * @param req - Express request object.
   * @param res - Express response object.
   * @param next - Next middleware trigger.
   */
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = getOrCreateRequestId(req, res);

    requestContextStorage.run({ requestId }, () => {
      next();
    });
  }
}
