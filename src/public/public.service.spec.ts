import { Test, TestingModule } from '@nestjs/testing';
import { PublicService } from './public.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SingleFlightService } from './single-flight.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MatchStatus, TournamentFormat, PhaseType } from '@prisma/client';

describe('PublicService', () => {
  let service: PublicService;
  let prisma: PrismaService;
  let redisClientMock: any;

  // Armazenamento em memória para simular o Redis
  let redisMemory: Map<string, string>;

  beforeEach(async () => {
    redisMemory = new Map<string, string>();

    redisClientMock = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(redisMemory.get(key) || null);
      }),
      set: jest
        .fn()
        .mockImplementation((key: string, value: string, _mode?: string, _ttl?: number) => {
          redisMemory.set(key, value);
          return Promise.resolve('OK');
        }),
      del: jest.fn().mockImplementation((...keys: string[]) => {
        let count = 0;
        for (const k of keys) {
          if (redisMemory.delete(k)) count++;
        }
        return Promise.resolve(count);
      }),
      keys: jest.fn().mockImplementation((pattern: string) => {
        const regexPattern = pattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexPattern}$`);
        return Promise.resolve(Array.from(redisMemory.keys()).filter((k) => regex.test(k)));
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicService,
        SingleFlightService,
        {
          provide: PrismaService,
          useValue: {
            competitionEdition: {
              findUnique: jest.fn(),
            },
            tournament: {
              findUnique: jest.fn(),
            },
            match: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            phase: {
              findMany: jest.fn(),
            },
            phaseStanding: {
              findMany: jest.fn().mockResolvedValue([]),
            },
          },
        },
        {
          provide: RedisService,
          useValue: {
            getClient: () => redisClientMock,
          },
        },
      ],
    }).compile();

    service = module.get<PublicService>(PublicService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLiveMatches', () => {
    it('should throw NotFoundException if edition does not exist', async () => {
      jest.spyOn(prisma.competitionEdition, 'findUnique').mockResolvedValue(null);

      await expect(service.getLiveMatches('edition-1')).rejects.toThrow(NotFoundException);
    });

    it('should return mapped live matches and save to redis cache', async () => {
      jest
        .spyOn(prisma.competitionEdition, 'findUnique')
        .mockResolvedValue({ id: 'edition-1' } as any);

      const dbMatches = [
        {
          id: 'match-1',
          scoreA: 2,
          scoreB: 1,
          venue: 'Ginásio A',
          phase: {
            tournament: {
              name: 'Futsal Masc',
              editionDiscipline: {
                discipline: {
                  name: 'Futsal',
                },
              },
            },
          },
          entryA: { team: { name: 'Time A' }, athlete: null },
          entryB: { team: null, athlete: { name: 'Atleta B' } },
        },
      ];

      jest.spyOn(prisma.match, 'findMany').mockResolvedValue(dbMatches as any);

      const result = await service.getLiveMatches('edition-1');

      expect(result).toEqual([
        {
          matchId: 'match-1',
          tournamentName: 'Futsal Masc',
          disciplineName: 'Futsal',
          entryA: 'Time A',
          entryB: 'Atleta B',
          scoreA: 2,
          scoreB: 1,
          venue: 'Ginásio A',
        },
      ]);

      // Verifica se salvou no cache
      expect(redisClientMock.set).toHaveBeenCalledWith(
        'edition:edition-1:live',
        JSON.stringify(result),
        'EX',
        5,
      );
    });

    it('should hit the database only once when 100 requests arrive concurrently (Single Flight)', async () => {
      jest
        .spyOn(prisma.competitionEdition, 'findUnique')
        .mockResolvedValue({ id: 'edition-1' } as any);

      const dbMatches = [
        {
          id: 'match-1',
          scoreA: 0,
          scoreB: 0,
          venue: 'Ginásio A',
          phase: {
            tournament: {
              name: 'Futsal Masc',
              editionDiscipline: {
                discipline: {
                  name: 'Futsal',
                },
              },
            },
          },
          entryA: null,
          entryB: null,
        },
      ];

      const findManySpy = jest.spyOn(prisma.match, 'findMany').mockImplementation(async () => {
        // Pequeno delay artificial para garantir sobreposição de promessas
        await new Promise((resolve) => setTimeout(resolve, 50));
        return dbMatches as any;
      });

      // Dispara 100 requisições simultâneas
      const promises = Array.from({ length: 100 }).map(() => service.getLiveMatches('edition-1'));

      const results = await Promise.all(promises);

      // Todas devem ter retornado a mesma resposta válida
      expect(results.length).toBe(100);
      expect(results[0]).toEqual([
        {
          matchId: 'match-1',
          tournamentName: 'Futsal Masc',
          disciplineName: 'Futsal',
          entryA: null,
          entryB: null,
          scoreA: 0,
          scoreB: 0,
          venue: 'Ginásio A',
        },
      ]);

      // Apenas uma consulta ao banco foi feita
      expect(findManySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSchedule', () => {
    it('should throw BadRequestException if date is missing or invalid', async () => {
      await expect(service.getSchedule('edition-1', '')).rejects.toThrow(BadRequestException);
      await expect(service.getSchedule('edition-1', '2026-10')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getSchedule('edition-1', 'invalid-date')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return mapped matches for a specific date', async () => {
      jest
        .spyOn(prisma.competitionEdition, 'findUnique')
        .mockResolvedValue({ id: 'edition-1' } as any);

      const dbMatches = [
        {
          id: 'match-2',
          scoreA: 1,
          scoreB: 3,
          venue: 'Campo B',
          status: MatchStatus.SCHEDULED,
          scheduledAt: new Date('2026-10-13T14:00:00Z'),
          phase: {
            tournament: {
              name: 'Futebol Masc',
              editionDiscipline: {
                discipline: {
                  name: 'Futebol',
                },
              },
            },
          },
          entryA: { team: { name: 'Poli' }, athlete: null },
          entryB: { team: { name: 'CIn' }, athlete: null },
        },
      ];

      jest.spyOn(prisma.match, 'findMany').mockResolvedValue(dbMatches as any);

      const result = await service.getSchedule('edition-1', '2026-10-13');

      expect(result).toEqual([
        {
          matchId: 'match-2',
          tournamentName: 'Futebol Masc',
          disciplineName: 'Futebol',
          entryA: 'Poli',
          entryB: 'CIn',
          scoreA: 1,
          scoreB: 3,
          venue: 'Campo B',
          status: MatchStatus.SCHEDULED,
          scheduledAt: dbMatches[0].scheduledAt,
        },
      ]);
    });
  });

  describe('getBracket', () => {
    it('should throw NotFoundException if tournament does not exist', async () => {
      jest.spyOn(prisma.tournament, 'findUnique').mockResolvedValue(null);

      await expect(service.getBracket('tour-1')).rejects.toThrow(NotFoundException);
    });

    it('should return bracket for GROUP phase', async () => {
      jest.spyOn(prisma.tournament, 'findUnique').mockResolvedValue({
        id: 'tour-1',
        format: TournamentFormat.GROUP_KNOCKOUT,
      } as any);

      const dbPhases = [
        {
          id: 'phase-grupos',
          name: 'Fase de Grupos',
          type: PhaseType.GROUP,
          groups: [
            {
              id: 'group-a',
              name: 'Grupo A',
              entries: [{ entryId: 'entry-a' }, { entryId: 'entry-b' }],
            },
          ],
        },
      ];

      jest.spyOn(prisma.phase, 'findMany').mockResolvedValue(dbPhases as any);

      const dbStandings = [
        {
          phaseId: 'phase-grupos',
          entryId: 'entry-a',
          played: 2,
          won: 2,
          drawn: 0,
          lost: 0,
          scoreFor: 4,
          scoreAgainst: 1,
          points: 6,
          rank: 1,
          entry: { team: { name: 'Time A' }, athlete: null },
        },
        {
          phaseId: 'phase-grupos',
          entryId: 'entry-b',
          played: 2,
          won: 0,
          drawn: 0,
          lost: 2,
          scoreFor: 1,
          scoreAgainst: 4,
          points: 0,
          rank: 2,
          entry: { team: { name: 'Time B' }, athlete: null },
        },
      ];

      jest.spyOn(prisma.phaseStanding, 'findMany').mockResolvedValue(dbStandings as any);

      const result = await service.getBracket('tour-1');

      expect(result.format).toBe(TournamentFormat.GROUP_KNOCKOUT);
      expect(result.phases[0]).toEqual({
        phaseId: 'phase-grupos',
        name: 'Fase de Grupos',
        type: PhaseType.GROUP,
        groups: [
          {
            name: 'Grupo A',
            standings: [
              {
                entryId: 'entry-a',
                entryName: 'Time A',
                played: 2,
                won: 2,
                drawn: 0,
                lost: 0,
                scoreFor: 4,
                scoreAgainst: 1,
                points: 6,
                rank: 1,
              },
              {
                entryId: 'entry-b',
                entryName: 'Time B',
                played: 2,
                won: 0,
                drawn: 0,
                lost: 2,
                scoreFor: 1,
                scoreAgainst: 4,
                points: 0,
                rank: 2,
              },
            ],
          },
        ],
      });
    });

    it('should return bracket for KNOCKOUT phase', async () => {
      jest.spyOn(prisma.tournament, 'findUnique').mockResolvedValue({
        id: 'tour-1',
        format: TournamentFormat.SINGLE_ELIMINATION,
      } as any);

      const dbPhases = [
        {
          id: 'phase-mata',
          name: 'Mata-mata',
          type: PhaseType.KNOCKOUT,
          matches: [
            {
              round: 1,
              bracketSlot: 1,
              entryAId: 'entry-a',
              entryBId: 'entry-b',
              winnerEntryId: 'entry-a',
              scoreA: 2,
              scoreB: 1,
              entryA: { id: 'entry-a', team: { name: 'Time A' } },
              entryB: { id: 'entry-b', team: { name: 'Time B' } },
            },
          ],
        },
      ];

      jest.spyOn(prisma.phase, 'findMany').mockResolvedValue(dbPhases as any);

      const result = await service.getBracket('tour-1');

      expect(result.phases[0].matches).toEqual([
        {
          round: 1,
          bracketSlot: 1,
          entryA: 'Time A',
          entryB: 'Time B',
          scoreA: 2,
          scoreB: 1,
          winner: 'Time A',
        },
      ]);
    });
  });
});
