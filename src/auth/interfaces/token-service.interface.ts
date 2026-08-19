export const ITokenService = Symbol('ITokenService');

export type TokenType = 'access' | 'refresh' | (string & {});

export interface ITokenService {
  /**
   * Signs a payload to generate a JWT token string.
   */
  sign(payload: object, options?: { expiresIn?: string | number; tokenType?: TokenType }): string;

  /**
   * Verifies and decodes a JWT token string.
   */
  verify<T>(token: string, options?: { tokenType?: TokenType }): T;
}
