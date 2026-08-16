import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

describe('PublicController', () => {
  let controller: PublicController;
  let service: PublicService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
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

  it('should call service.getBracket with tournamentId', async () => {
    const mockResult = { format: 'GROUP_KNOCKOUT', phases: [] };
    jest.spyOn(service, 'getBracket').mockResolvedValue(mockResult as any);

    const result = await controller.getBracket('tour-1');

    expect(service.getBracket).toHaveBeenCalledWith('tour-1');
    expect(result).toBe(mockResult);
  });
});
