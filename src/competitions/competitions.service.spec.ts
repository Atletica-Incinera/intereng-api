import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CompetitionsService } from './competitions.service';
import { BootstrapCompetitionDto } from './dto/bootstrap-competition.dto';

describe('CompetitionsService.bootstrap', () => {
  let service: CompetitionsService;

  const mockTransactionClient = {
    competition: { count: jest.fn(), create: jest.fn() },
    competitionEdition: { create: jest.fn() },
  };

  const mockPrismaService = {
    $transaction: jest.fn((callback: (tx: typeof mockTransactionClient) => unknown) =>
      callback(mockTransactionClient),
    ),
  };

  const mockAuditService = { record: jest.fn() };

  const dto: BootstrapCompetitionDto = {
    name: 'InterEng',
    slug: 'intereng',
    year: 2027,
    start: '2027-10-10',
    end: '2027-10-17',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get(CompetitionsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('cria competição e edição já ativas quando o sistema está genuinamente vazio', async () => {
    mockTransactionClient.competition.count.mockResolvedValue(0);
    mockTransactionClient.competition.create.mockResolvedValue({ id: 'comp-1', name: 'InterEng' });
    mockTransactionClient.competitionEdition.create.mockResolvedValue({
      id: 'edition-1',
      year: 2027,
    });

    const result = await service.bootstrap(dto, 'staff-1');

    expect(mockTransactionClient.competition.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true }) }),
    );
    expect(mockTransactionClient.competitionEdition.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: true, competitionId: 'comp-1' }) }),
    );
    // Sem isto o pipeline de ações também não conseguiria criar a segunda
    // competição: a auditoria precisa refletir a criação, como qualquer ação.
    expect(mockAuditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'staff-1', action: 'competition/bootstrap' }),
      mockTransactionClient,
    );
    expect(result).toEqual({ id: 'edition-1', year: 2027 });
  });

  it('recusa quando já existe alguma competição — o caminho normal volta a valer', async () => {
    mockTransactionClient.competition.count.mockResolvedValue(1);

    await expect(service.bootstrap(dto, 'staff-1')).rejects.toThrow(ConflictException);
    expect(mockTransactionClient.competition.create).not.toHaveBeenCalled();
  });

  it('recusa datas invertidas antes de abrir a transação', async () => {
    await expect(
      service.bootstrap({ ...dto, start: '2027-10-20', end: '2027-10-10' }, 'staff-1'),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });
});
