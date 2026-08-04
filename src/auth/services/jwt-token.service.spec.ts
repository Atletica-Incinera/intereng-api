import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  let tokenService: JwtTokenService;

  beforeEach(() => {
    tokenService = new JwtTokenService();
  });

  it('should be defined', () => {
    expect(tokenService).toBeDefined();
  });

  it('should sign and verify access token', () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    const token = tokenService.sign(payload);

    expect(token).toBeDefined();

    const decoded = tokenService.verify<{ sub: string; email: string }>(token);
    expect(decoded.sub).toEqual(payload.sub);
    expect(decoded.email).toEqual(payload.email);
  });

  it('should sign and verify refresh token with 7d expiration', () => {
    const payload = { sub: 'user-123' };
    const token = tokenService.sign(payload, { expiresIn: '7d' });

    expect(token).toBeDefined();

    const decoded = tokenService.verify<{ sub: string }>(token);
    expect(decoded.sub).toEqual(payload.sub);
  });

  it('should throw an error when verifying an invalid token', () => {
    expect(() => tokenService.verify('invalid-token')).toThrow();
  });
});
