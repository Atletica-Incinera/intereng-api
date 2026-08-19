import { Test, TestingModule } from '@nestjs/testing';
import { ActiveEditionResolver } from '../edition-snapshots/active-edition.resolver';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController', () => {
  let controller: PublicController;
  let service: PublicService;
  let resolver: { resolve: jest.Mock };

  beforeEach(async () => {
    resolver = { resolve: jest.fn().mockResolvedValue({ id: 'edicao-resolvida' }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        {
          provide: EditionSnapshotsService,
          useValue: {
            getPublicSnapshot: jest.fn(),
          },
        },
        { provide: ActiveEditionResolver, useValue: resolver },
        { provide: PrismaService, useValue: {} },
        {
          provide: PublicService,
          useValue: {
            getLiveMatches: jest.fn(),
            getSchedule: jest.fn(),
            getBracket: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
    service = module.get<PublicService>(PublicService);
  });

  it('should call service.getLiveMatches with editionId', async () => {
    const mockResult = [{ matchId: 'm1' }];
    jest.spyOn(service, 'getLiveMatches').mockResolvedValue(mockResult as any);

    const result = await controller.getLiveMatches('ed-1');

    expect(service.getLiveMatches).toHaveBeenCalledWith('ed-1');
    expect(result).toBe(mockResult);
  });

  it('should call service.getSchedule with editionId and date', async () => {
    const mockResult = [{ matchId: 'm2' }];
    jest.spyOn(service, 'getSchedule').mockResolvedValue(mockResult as any);

    const result = await controller.getSchedule('ed-1', '2026-10-13');

    expect(service.getSchedule).toHaveBeenCalledWith('ed-1', '2026-10-13');
    expect(result).toBe(mockResult);
  });

  // O alias `active` valia só para o snapshot público: /live e /schedule
  // recebiam a palavra crua e devolviam 404. Resolver antes de chamar o service
  // também mantém o cache indexado pela edição real, e não pelo literal.
  it('troca o alias active pelo ID real antes de consultar as partidas ao vivo', async () => {
    jest.spyOn(service, 'getLiveMatches').mockResolvedValue([] as any);

    await controller.getLiveMatches('active');

    expect(resolver.resolve).toHaveBeenCalled();
    expect(service.getLiveMatches).toHaveBeenCalledWith('edicao-resolvida');
  });

  it('troca o alias active pelo ID real antes de consultar a agenda', async () => {
    jest.spyOn(service, 'getSchedule').mockResolvedValue([] as any);

    await controller.getSchedule('active', '2026-10-13');

    expect(service.getSchedule).toHaveBeenCalledWith('edicao-resolvida', '2026-10-13');
  });

  it('não resolve nada quando o ID já é explícito', async () => {
    jest.spyOn(service, 'getLiveMatches').mockResolvedValue([] as any);

    await controller.getLiveMatches('intereng-2026');

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(service.getLiveMatches).toHaveBeenCalledWith('intereng-2026');
  });

  it('should call service.getBracket with tournamentId', async () => {
    const mockResult = { format: 'GROUP_KNOCKOUT', phases: [] };
    jest.spyOn(service, 'getBracket').mockResolvedValue(mockResult as any);

    const result = await controller.getBracket('tour-1');

    expect(service.getBracket).toHaveBeenCalledWith('tour-1');
    expect(result).toBe(mockResult);
  });
});
