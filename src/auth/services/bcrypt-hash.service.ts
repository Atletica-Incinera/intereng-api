import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IHashService } from '../interfaces/hash-service.interface';

@Injectable()
export class BcryptHashService implements IHashService {
  async hash(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, 10);
  }

  async compare(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
