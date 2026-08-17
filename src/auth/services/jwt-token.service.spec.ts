import { JwtTokenService } from './jwt-token.service';
import { ConfigService } from '../../common/config/config.service';

describe('JwtTokenService', () => {
  let tokenService: JwtTokenService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    tokenService = new JwtTokenService(configService);
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
    const token = tokenService.sign(payload, { expiresIn: '7d', tokenType: 'refresh' });

    expect(token).toBeDefined();

    const decoded = tokenService.verify<{ sub: string }>(token, { tokenType: 'refresh' });
    expect(decoded.sub).toEqual(payload.sub);
  });

  it('should throw an error when verifying a refresh token as an access token', () => {
    const payload = { sub: 'user-123' };
    const token = tokenService.sign(payload, { expiresIn: '7d', tokenType: 'refresh' });

    expect(() => tokenService.verify<{ sub: string }>(token)).toThrow();
  });

  it('should throw an error when verifying an access token as a refresh token', () => {
    const payload = { sub: 'user-123', email: 'test@example.com' };
    const token = tokenService.sign(payload);

    expect(() => tokenService.verify<{ sub: string }>(token, { tokenType: 'refresh' })).toThrow();
  });

  it('should throw an error when verifying an invalid token', () => {
    expect(() => tokenService.verify('invalid-token')).toThrow();
  });
});
