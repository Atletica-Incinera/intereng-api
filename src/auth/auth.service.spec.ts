import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { IHashService } from './interfaces/hash-service.interface';
import { ITokenService } from './interfaces/token-service.interface';

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

  const mockHashService = {
    compare: jest.fn(),
    hash: jest.fn(),
  };

  const mockTokenService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: IHashService, useValue: mockHashService },
        { provide: ITokenService, useValue: mockTokenService },
      ],
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
      mockHashService.compare.mockResolvedValue(false);

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
      mockHashService.compare.mockResolvedValue(true);
      mockTokenService.sign
        .mockReturnValueOnce('mockAccessToken')
        .mockReturnValueOnce('mockRefreshToken');

      const result = await service.login({
        email: 'test@example.com',
        password: 'password',
      });

      expect(result).toHaveProperty('accessToken', 'mockAccessToken');
      expect(result).toHaveProperty('refreshToken', 'mockRefreshToken');
      expect(result.expiresIn).toBe(900);
      expect(result.staff.email).toBe(staffMock.email);
    });
  });
});
