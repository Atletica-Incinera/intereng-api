import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ITokenService } from '../interfaces/token-service.interface';

@Injectable()
export class JwtTokenService implements ITokenService {
  sign(payload: Record<string, any>, options?: { expiresIn: string | number }): string {
    const secret =
      options?.expiresIn === '7d'
        ? process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-change-me'
        : process.env.JWT_SECRET || 'super-secret-key-change-me';
    return jwt.sign(payload, secret, options as jwt.SignOptions);
  }

  verify<T>(token: string): T {
    try {
      // Try verifying as an access token first, then refresh token
      try {
        const secret = process.env.JWT_SECRET || 'super-secret-key-change-me';
        return jwt.verify(token, secret) as T;
      } catch {
        const refreshSecret =
          process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-change-me';
        return jwt.verify(token, refreshSecret) as T;
      }
    } catch (err) {
      throw err;
    }
  }
}
