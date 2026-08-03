/**
 * @fileoverview Request context utility functions.
 */

import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';

/**
 * Resolves a request tracing identifier and ensures headers are set on both request and response.
 *
 * The resolution flow follows this priority order:
 * 1. Checks if a request ID has already been attached to the incoming request object (e.g., by pino-http).
 * 2. Checks the request headers for `x-request-id` or `x-correlation-id`.
 * 3. Falls back to generating a new random UUID.
 *
 * Once resolved, the function synchronizes the `x-request-id` header to both the incoming request
 * headers (so downstream middleware/services can read it) and the outgoing response headers (so clients
 * receive the tracing ID).
 *
 * @param req - The incoming HTTP request.
 * @param res - The outgoing HTTP response.
 * @returns The resolved request tracing UUID.
 */
export function getOrCreateRequestId(
  req: IncomingMessage & { id?: unknown },
  res: ServerResponse,
): string {
  const headerId =
    req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const requestId =
    (typeof req.id === 'string' ? req.id : undefined) ||
    (typeof headerId === 'string' ? headerId : undefined) ||
    randomUUID();

  // Propagate to request headers so it is available to NestJS interceptors/guards
  req.headers['x-request-id'] = requestId;

  // Propagate to response headers if they are not yet sent, allowing the client to trace the request
  if (!res.headersSent) {
    res.setHeader('x-request-id', requestId);
  }

  return requestId;
}
