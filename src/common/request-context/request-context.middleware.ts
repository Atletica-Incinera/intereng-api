import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { requestContextStorage } from './request-context.storage';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const reqWithId = req as Request & { id?: unknown };
    const headerId =
      req.headers['x-request-id'] || req.headers['x-correlation-id'];

    // If pino-http already generated a request id (as req.id), use it.
    // Otherwise, check headers or generate a new UUID.
    const requestId =
      (typeof reqWithId.id === 'string' ? reqWithId.id : undefined) ||
      (typeof headerId === 'string' ? headerId : undefined) ||
      randomUUID();

    // Ensure request headers and response headers are populated
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    requestContextStorage.run({ requestId }, () => {
      next();
    });
  }
}
