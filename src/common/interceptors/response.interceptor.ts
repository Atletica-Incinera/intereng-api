import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  data: T;
  meta?: unknown;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object';
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ResponseEnvelope<T>> {
    const http = context.switchToHttp();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((val: unknown): ResponseEnvelope<T> => {
        // Ignora envelopamento se for SSE (Server-Sent Events) ou se os headers já foram enviados
        const contentTypeHeader = response.getHeader?.('content-type');
        const contentType = typeof contentTypeHeader === 'string' ? contentTypeHeader : '';
        if (contentType.includes('text/event-stream')) {
          return val as ResponseEnvelope<T>;
        }

        // Se o valor retornado for no formato paginado { items, meta }
        if (isObject(val) && 'items' in val && 'meta' in val) {
          return {
            data: val.items as T,
            meta: val.meta,
          };
        }

        // Se o valor já for envelopado com { data }
        if (isObject(val) && 'data' in val) {
          return val as unknown as ResponseEnvelope<T>;
        }

        // Envelope padrão
        return {
          data: (val === undefined ? null : val) as T,
        };
      }),
    );
  }
}
