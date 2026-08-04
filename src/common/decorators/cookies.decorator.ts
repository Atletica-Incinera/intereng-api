import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithCookies extends Omit<Request, 'cookies'> {
  cookies?: Record<string, string>;
}

/**
 * Custom parameter decorator to extract a cookie value from the request.
 * Resolves cookie-parser parsed cookies if present, or falls back to manually parsing the Cookie header.
 *
 * @param data Optional name of the specific cookie to retrieve.
 * @param ctx The NestJS execution context.
 * @returns The value of the requested cookie, all cookies as a record, or null if not found.
 */
export const Cookies = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithCookies>();

  // If cookie-parser middleware is registered and populated cookies
  if (request.cookies) {
    return data ? request.cookies[data] : request.cookies;
  }

  // Fallback manual parsing if cookie-parser is not registered
  const rawCookies = request.headers.cookie;
  if (!rawCookies) {
    return null;
  }

  const cookies = rawCookies.split(';').reduce(
    (acc, c) => {
      const parts = c.trim().split('=');
      const key = parts[0];
      const val = parts.slice(1).join('=');
      if (key) acc[key] = val;
      return acc;
    },
    {} as Record<string, string>,
  );

  return data ? cookies[data] : cookies;
});
