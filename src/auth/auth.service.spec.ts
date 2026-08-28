import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { IHashService } from './interfaces/hash-service.interface';
import { ITokenService } from './interfaces/token-service.interface';
import { AuditService } from '../common/audit/audit.service';
import { ConfigService } from '../common/config/config.service';
import { RefreshSessionsService } from './services/refresh-sessions.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    staff: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
    revokeAllForStaff: jest.fn(),
  };

  const mockAuditService = {
    record: jest.fn(),
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
        { provide: AuditService, useValue: mockAuditService },
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
        mustChangePassword: false,
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
        mustChangePassword: false,
        editionRoles: [
          {
            roleAssignmentId: 'role-1',
            editionId: 'edition-1',
            editionName: 'InterEng 2026',
            editionDisciplineId: null,
            disciplineId: null,
            disciplineName: null,
            // Nulos porque o papel e de edicao: so o responsavel de atletica
            // se prende a uma equipe.
            teamId: null,
            teamName: null,
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

    it('should carry mustChangePassword into the issued tokens', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue({
        id: '1',
        name: 'Convidada',
        email: 'nova@example.com',
        passwordHash: 'hashedpassword',
        isSuperAdmin: true,
        mustChangePassword: true,
        editionRoles: [],
      });
      mockHashService.compare.mockResolvedValue(true);
      mockTokenService.sign.mockReturnValue('token');

      const result = await service.login({ email: 'nova@example.com', password: 'convite' });

      expect(result.auth.user.mustChangePassword).toBe(true);
      // O guard lê a marca do token para não consultar o banco a cada
      // requisição: se ela não viajar, a exigência de troca não é aplicada.
      expect(mockTokenService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ mustChangePassword: true }),
        expect.objectContaining({ tokenType: 'access' }),
      );
    });
  });

  describe('changePassword', () => {
    const pendingStaff = {
      id: '1',
      name: 'Convidada',
      email: 'nova@example.com',
      passwordHash: 'hashDaSenhaInicial',
      isSuperAdmin: true,
      mustChangePassword: true,
      editionRoles: [],
    };

    it('should reject when the current password does not match', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue(pendingStaff);
      mockHashService.compare.mockResolvedValue(false);

      await expect(
        service.changePassword('1', {
          currentPassword: 'errada',
          newPassword: 'senhaNovaSegura1',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.staff.update).not.toHaveBeenCalled();
    });

    it('should reject when the new password repeats the current one', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue(pendingStaff);
      mockHashService.compare.mockResolvedValue(true);

      await expect(
        service.changePassword('1', {
          currentPassword: 'senhaDeConvite1',
          newPassword: 'senhaDeConvite1',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.staff.update).not.toHaveBeenCalled();
    });

    it('should clear the flag, revoke every session and issue a new one', async () => {
      mockPrismaService.staff.findUnique.mockResolvedValue(pendingStaff);
      mockHashService.compare.mockResolvedValue(true);
      mockHashService.hash.mockResolvedValue('hashDaSenhaNova');
      mockTokenService.sign
        .mockReturnValueOnce('novoAccessToken')
        .mockReturnValueOnce('novoRefreshToken');

      const result = await service.changePassword('1', {
        currentPassword: 'senhaDeConvite1',
        newPassword: 'senhaNovaSegura1',
      });

      expect(mockPrismaService.staff.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { passwordHash: 'hashDaSenhaNova', mustChangePassword: false },
      });
      // Derruba também as sessões de quem já sabia a senha inicial.
      expect(mockRefreshSessionsService.revokeAllForStaff).toHaveBeenCalledWith('1');
      // A auditoria não pode carregar hash de senha.
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'auth/change-password', entityType: 'Staff' }),
      );
      expect(mockAuditService.record.mock.calls[0][0]).not.toHaveProperty('before');
      expect(mockAuditService.record.mock.calls[0][0]).not.toHaveProperty('after');
      // A sessão devolvida já vale para o sistema inteiro.
      expect(result.auth.user.mustChangePassword).toBe(false);
      expect(mockRefreshSessionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'novoRefreshToken', staffId: '1' }),
      );
    });
  });
});
