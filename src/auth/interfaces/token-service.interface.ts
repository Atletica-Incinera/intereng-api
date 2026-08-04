export const ITokenService = Symbol('ITokenService');

export interface ITokenService {
  /**
   * Signs a payload to generate a JWT token string.
   */
  sign(payload: Record<string, any>, options?: { expiresIn: string | number }): string;

  /**
   * Verifies and decodes a JWT token string.
   */
  verify<T>(token: string): T;
}
