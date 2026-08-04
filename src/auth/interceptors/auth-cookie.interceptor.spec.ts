import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuthCookieInterceptor } from './auth-cookie.interceptor';
import { CLEAR_COOKIE_KEY } from '../decorators/clear-cookie.decorator';

describe('AuthCookieInterceptor', () => {
  let interceptor: AuthCookieInterceptor;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockResponse: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new AuthCookieInterceptor(reflector);

    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
        getRequest: jest.fn().mockReturnValue({}),
      }),
      getHandler: jest.fn().mockReturnValue(() => {}),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should set refreshToken cookie when returned data contains refreshToken', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const mockResult = { accessToken: 'access-123', refreshToken: 'refresh-456' };
    mockCallHandler = { handle: () => of(mockResult) };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (data) => {
        expect(data).toEqual(mockResult);
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refreshToken',
          'refresh-456',
          expect.objectContaining({
            httpOnly: true,
            sameSite: 'strict',
          }),
        );
        done();
      },
    });
  });

  it('should clear cookie when route is decorated with @ClearCookie', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue('refreshToken');
    mockCallHandler = { handle: () => of({ success: true }) };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (data) => {
        expect(data).toEqual({ success: true });
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken');
        expect(mockResponse.cookie).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('should pass data without setting cookies when data has no refreshToken', (done) => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const mockResult = { user: { id: 1 } };
    mockCallHandler = { handle: () => of(mockResult) };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: (data) => {
        expect(data).toEqual(mockResult);
        expect(mockResponse.cookie).not.toHaveBeenCalled();
        expect(mockResponse.clearCookie).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
