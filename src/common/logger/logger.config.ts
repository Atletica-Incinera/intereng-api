/**
 * @fileoverview Pino structured logging configuration.
 */

import { Params } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'http';
import { requestContextStorage } from '../request-context/request-context.storage';
import { getOrCreateRequestId } from '../request-context/request-context.utils';

/**
 * Pino HTTP configuration factory that unifies structured logs with request-scoped tracing.
 *
 * Responsibilities:
 * 1. Traces each request with a unique ID using AsyncLocalStorage or headers context.
 * 2. Formats log entries as JSON containing the method, URL, status code, and latency.
 * 3. Adds the `requestId` to every log generated during the request lifecycle.
 * 4. Enables human-friendly formatting in non-production environments (pino-pretty).
 */
export const pinoLoggerConfig: Params = {
  pinoHttp: {
    /**
     * Resolves request ID for log lines. Matches AsyncLocalStorage context if available,
     * fallback to request headers or a new UUID using the unified helper.
     *
     * @param req - The incoming HTTP request.
     * @param res - The outgoing HTTP response.
     * @returns The request tracking ID.
     */
    genReqId: (req: IncomingMessage, res: ServerResponse): string => {
      const storageId = requestContextStorage.getStore()?.requestId;
      if (storageId) {
        return storageId;
      }
      return getOrCreateRequestId(req, res);
    },
    /**
     * Custom properties injected into every structured log line of a request.
     *
     * @param req - The incoming HTTP request.
     * @returns Object containing the requestId property.
     */
    customProps: (req: IncomingMessage & { id?: unknown }) => ({
      requestId: typeof req.id === 'string' ? req.id : undefined,
    }),
    /**
     * Serializers to filter log volume and prevent logging sensitive data.
     */
    serializers: {
      req: (req: IncomingMessage & { id?: unknown }) => ({
        id: typeof req.id === 'string' ? req.id : undefined,
        method: req.method,
        url: req.url,
      }),
      res: (res: ServerResponse) => ({
        statusCode: res.statusCode,
      }),
    },
    /**
     * Development output formatting. Prints colorized single-line logs instead of raw JSON.
     */
    transport:
      process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
            },
          }
        : undefined,
  },
};
