import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    staff: {
      findUnique: jest.fn(),
    },
    editionStaffRole: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if staff is not found', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'test@example.com', password: 'password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        isSuperAdmin: false,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return tokens and staff data on successful login', async () => {
      const staffMock = {
        id: '1',
        name: 'John Doe',
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        isSuperAdmin: false,
      };
      mockPrismaService.staff.findUnique.mockResolvedValue(staffMock);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.expiresIn).toBe(900);
      expect(result.staff.email).toBe(staffMock.email);
    });
  });
});
