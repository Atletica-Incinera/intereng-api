import { Injectable } from '@nestjs/common';
import { env, type RequiredEnv } from './env';

type CookieSameSite = 'lax' | 'strict' | 'none';

/**
 * Service responsible for accessing application configuration.
 * It encapsulates environment variable lookups and defines fallback configurations.
 */
@Injectable()
export class ConfigService {
  constructor() {
    // Os getters de segredo são preguiçosos: sem tocá-los aqui, a falta de um
    // deles só apareceria no primeiro login — ou, pior, nunca, porque o valor
    // padrão assumiria o lugar em silêncio. Lidos no boot, a ausência derruba a
    // aplicação antes de ela atender qualquer requisição.
    void env.staffInvitePassword;
    void env.jwtSecret;
    void env.jwtRefreshSecret;
    void env.piiPepper;
    void env.piiEncryptionKey;
  }

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

  get jwtAccessTtlSeconds(): number {
    return env.jwtAccessTtlSeconds;
  }

  get jwtRefreshTtlSeconds(): number {
    return env.jwtRefreshTtlSeconds;
  }

  get staffInvitePassword(): string {
    return env.staffInvitePassword;
  }

  get cookieDomain(): string | undefined {
    return env.cookieDomain;
  }

  get cookiePath(): string {
    return env.cookiePath;
  }

  get cookieSecure(): boolean {
    return env.cookieSecure;
  }

  get cookieSameSite(): CookieSameSite {
    return env.cookieSameSite;
  }

  /**
   * Retrieves the JWT secret for a given token type.
   * Leverages convention (e.g. JWT_REFRESH_SECRET) to allow extension without code modification.
   */
  getJwtSecret(tokenType: string): string {
    if (tokenType === 'access') return this.jwtSecret;
    if (tokenType === 'refresh') return this.jwtRefreshSecret;

    return this.getOrThrow(`JWT_${tokenType.toUpperCase()}_SECRET`);
  }
}
