import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { IHashService } from './interfaces/hash-service.interface';
import { ITokenService } from './interfaces/token-service.interface';
import { ConfigService } from '../common/config/config.service';
import { RefreshSessionsService } from './services/refresh-sessions.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    staff: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    jwtAccessTtlSeconds: 900,
    jwtRefreshTtlSeconds: 604800,
  };

  const mockRefreshSessionsService = {
    create: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
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
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RefreshSessionsService, useValue: mockRefreshSessionsService },
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
        editionRoles: [],
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
        editionRoles: [
          {
            id: 'role-1',
            editionId: 'edition-1',
            role: 'EDITION_ADMIN',
            edition: { name: 'InterEng 2026' },
            editionDiscipline: null,
          },
        ],
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

      expect(result.auth.token).toBe('mockAccessToken');
      expect(result.refreshToken).toBe('mockRefreshToken');
      expect(result.auth.user).toEqual({
        id: staffMock.id,
        email: staffMock.email,
        name: staffMock.name,
        role: 'EDITION_ADMIN',
        editionRoles: [
          {
            roleAssignmentId: 'role-1',
            editionId: 'edition-1',
            editionName: 'InterEng 2026',
            editionDisciplineId: null,
            disciplineId: null,
            disciplineName: null,
            role: 'EDITION_ADMIN',
          },
        ],
      });
      expect(Date.parse(result.auth.expiresAt)).toBeGreaterThan(Date.now());
      expect(mockRefreshSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'mockRefreshToken',
          staffId: staffMock.id,
          editionId: 'edition-1',
        }),
      );
    });
  });
});
