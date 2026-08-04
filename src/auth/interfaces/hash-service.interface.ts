export const IHashService = Symbol('IHashService');

export interface IHashService {
  /**
   * Hashes a plain text string.
   */
  hash(plainText: string): Promise<string>;

  /**
   * Compares a plain text string with a hash to verify if they match.
   */
  compare(plainText: string, hash: string): Promise<boolean>;
}
