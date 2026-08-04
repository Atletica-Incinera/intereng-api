export interface ITokenService {
  sign(payload: Record<string, any>, options?: { expiresIn: string | number }): string;
  verify<T>(token: string): T;
}
