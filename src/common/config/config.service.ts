import { Injectable } from '@nestjs/common';
import { env, type RequiredEnv } from './env';

/**
 * Service responsible for accessing application configuration.
 * It encapsulates environment variable lookups and defines fallback configurations.
 */
@Injectable()
export class ConfigService {
  /**
   * Retrieves an environment variable by key.
   */
  get(key: string): string | undefined {
    return process.env[key];
  }

  required(key: RequiredEnv): string {
    return env.required(key);
  }

  /**
   * Retrieves an environment variable or throws an error if it is not defined.
   */
  getOrThrow(key: string): string {
    const val = this.get(key);
    if (val === undefined) {
      throw new Error(`Configuration key "${key}" is missing`);
    }
    return val;
  }

  /**
   * Retrieves an environment variable or returns a fallback value.
   */
  getWithFallback(key: string, fallback: string): string {
    return this.get(key) || fallback;
  }

  /**
   * Getter for JWT_SECRET.
   */
  get jwtSecret(): string {
    return env.jwtSecret;
  }

  /**
   * Getter for JWT_REFRESH_SECRET.
   */
  get jwtRefreshSecret(): string {
    return env.jwtRefreshSecret;
  }

  /**
   * Retrieves the JWT secret for a given token type.
   * Leverages convention (e.g. JWT_REFRESH_SECRET) to allow extension without code modification.
   */
  getJwtSecret(tokenType: string): string {
    const key = tokenType === 'access' ? 'JWT_SECRET' : `JWT_${tokenType.toUpperCase()}_SECRET`;
    const fallback =
      tokenType === 'refresh'
        ? 'super-secret-refresh-key-change-me'
        : tokenType === 'access'
          ? 'super-secret-key-change-me'
          : `super-secret-${tokenType}-key-change-me`;
    return this.getWithFallback(key, fallback);
  }
}
