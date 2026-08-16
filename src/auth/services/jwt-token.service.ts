/**
 * Service responsible for creating and verifying JWT tokens.
 * It delegates secret management to ConfigService, allowing flexible token types
 * (access, refresh, or custom) without hard‑coded fallbacks, thus respecting
 * the Open/Closed Principle.
 */
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ITokenService, TokenType } from '../interfaces/token-service.interface';
import { ConfigService } from '../../common/config/config.service';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Signs a payload to generate a JWT token string.
   * The secret used depends on the optional `tokenType` provided in options.
   */
  sign(payload: object, options?: { expiresIn?: string | number; tokenType?: TokenType }): string {
    const tokenType = options?.tokenType ?? 'access';
    const secret = this.configService.getJwtSecret(tokenType);
    const signOptions: jwt.SignOptions = {};
    if (options?.expiresIn !== undefined) {
      signOptions.expiresIn = options.expiresIn as jwt.SignOptions['expiresIn'];
    }
    return jwt.sign(payload, secret, signOptions);
  }

  /**
   * Verifies the validity of a given JWT token.
   *
   * @template T The expected type of the decoded token payload.
   * @param token The JWT token string to verify.
   * @param options Configuration options containing tokenType.
   * @returns The decoded token payload of type T if verification is successful.
   * @throws {JsonWebTokenError} If the signature is invalid or token is malformed.
   * @throws {TokenExpiredError} If the token has expired.
   */
  verify<T>(token: string, options?: { tokenType?: TokenType }): T {
    const tokenType = options?.tokenType ?? 'access';
    const secret = this.configService.getJwtSecret(tokenType);
    return jwt.verify(token, secret) as T;
  }
}
