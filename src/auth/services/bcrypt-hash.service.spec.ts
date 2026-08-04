import { BcryptHashService } from './bcrypt-hash.service';

describe('BcryptHashService', () => {
  let hashService: BcryptHashService;

  beforeEach(() => {
    hashService = new BcryptHashService();
  });

  it('should be defined', () => {
    expect(hashService).toBeDefined();
  });

  it('should hash a plain text string and compare correctly', async () => {
    const plainText = 'password123';
    const hashed = await hashService.hash(plainText);

    expect(hashed).toBeDefined();
    expect(hashed).not.toEqual(plainText);

    const isMatch = await hashService.compare(plainText, hashed);
    expect(isMatch).toBe(true);

    const isWrongMatch = await hashService.compare('wrongpassword', hashed);
    expect(isWrongMatch).toBe(false);
  });
});
