import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let responseHeaders: Record<string, string>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
    responseHeaders = {};

    const mockResponse = {
      getHeader: jest.fn((name: string) => responseHeaders[name.toLowerCase()]),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should wrap basic response in data envelope', (done) => {
    mockCallHandler = {
      handle: () => of('test-value'),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({ data: 'test-value' });
        done();
      },
    });
  });

  it('should wrap undefined/void responses in data: null', (done) => {
    mockCallHandler = {
      handle: () => of(undefined),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({ data: null });
        done();
      },
    });
  });

  it('should transform paginated response with items and meta', (done) => {
    mockCallHandler = {
      handle: () =>
        of({
          items: ['item1', 'item2'],
          meta: { total: 2, page: 1 },
        }),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({
          data: ['item1', 'item2'],
          meta: { total: 2, page: 1 },
        });
        done();
      },
    });
  });

  it('should pass through already enveloped data', (done) => {
    mockCallHandler = {
      handle: () => of({ data: 'already-enveloped' }),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toEqual({ data: 'already-enveloped' });
        done();
      },
    });
  });

  it('should bypass transformation for text/event-stream content-type (SSE)', (done) => {
    responseHeaders['content-type'] = 'text/event-stream';
    const rawStreamData = { some: 'sse-event' };

    mockCallHandler = {
      handle: () => of(rawStreamData),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (result) => {
        expect(result).toBe(rawStreamData);
        done();
      },
    });
  });
});
