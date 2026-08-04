import { CLEAR_COOKIE_KEY, ClearCookie } from './clear-cookie.decorator';
import { Reflector } from '@nestjs/core';

describe('ClearCookie Decorator', () => {
  it('should set metadata with key clear_cookie and specified cookie name', () => {
    class TestController {
      @ClearCookie('refreshToken')
      testMethod() {}
    }

    const reflector = new Reflector();
    const metadata = reflector.get(CLEAR_COOKIE_KEY, TestController.prototype.testMethod);

    expect(metadata).toBe('refreshToken');
  });
});
