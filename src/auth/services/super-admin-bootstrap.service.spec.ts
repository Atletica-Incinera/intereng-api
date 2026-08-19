import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '../../common/config/config.service';
import { IHashService } from '../interfaces/hash-service.interface';
import { SuperAdminBootstrapService } from './super-admin-bootstrap.service';

describe('SuperAdminBootstrapService', () => {
  let service: SuperAdminBootstrapService;

  const mockPrismaService = {
    staff: {
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService: { bootstrapSuperAdmin: { email: string; password: string } | undefined } =
    {
      bootstrapSuperAdmin: undefined,
    };

  const mockHashService = {
    hash: jest.fn(),
    compare: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminBootstrapService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: IHashService, useValue: mockHashService },
      ],
    }).compile();

    service = module.get(SuperAdminBootstrapService);
    mockConfigService.bootstrapSuperAdmin = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does nothing when the credentials are absent', async () => {
    await expect(service.run()).resolves.toBe('not-configured');
    expect(mockPrismaService.staff.count).not.toHaveBeenCalled();
  });

  it('does nothing when a super admin already exists', async () => {
    mockConfigService.bootstrapSuperAdmin = { email: 'chefe@intereng.com', password: 'senhaLonga123' };
    mockPrismaService.staff.count.mockResolvedValue(1);

    await expect(service.run()).resolves.toBe('already-exists');
    expect(mockPrismaService.staff.create).not.toHaveBeenCalled();
  });

  it('creates the first super admin already requiring a password change', async () => {
    mockConfigService.bootstrapSuperAdmin = { email: 'chefe@intereng.com', password: 'senhaLonga123' };
    mockPrismaService.staff.count.mockResolvedValue(0);
    mockHashService.hash.mockResolvedValue('hashDaSenha');
    mockPrismaService.staff.create.mockResolvedValue({ id: '1', email: 'chefe@intereng.com' });

    await expect(service.run()).resolves.toBe('created');
    expect(mockPrismaService.staff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'chefe@intereng.com',
          passwordHash: 'hashDaSenha',
          isSuperAdmin: true,
          // A senha veio de uma variável de ambiente e de um secret do CI: ela
          // não pode ser a senha definitiva de quem administra o sistema.
          mustChangePassword: true,
        }),
      }),
    );
  });

  it('reports instead of promoting when the e-mail belongs to someone else', async () => {
    mockConfigService.bootstrapSuperAdmin = { email: 'ana@ufpe.br', password: 'senhaLonga123' };
    mockPrismaService.staff.count.mockResolvedValue(0);
    mockHashService.hash.mockResolvedValue('hashDaSenha');
    mockPrismaService.staff.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(service.run()).resolves.toBe('email-taken');
  });
});
