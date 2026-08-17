import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PhaseType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { SingleFlightService } from './single-flight.service';
import {
  toLiveMatchDto,
  toScheduleMatchDto,
  toGroupPhaseDto,
  toKnockoutPhaseDto,
} from './public.mapper';
import {
  getLiveMatchesCacheKey,
  getBracketCacheKey,
  getScheduleCacheKey,
} from './public-cache.keys';

const MATCH_INCLUDE = {
  phase: {
    include: {
      tournament: {
        include: {
          editionDiscipline: {
            include: {
              discipline: true,
            },
          },
        },
      },
    },
  },
  entryA: {
    include: {
      team: true,
      athlete: true,
    },
  },
  entryB: {
    include: {
      team: true,
      athlete: true,
    },
  },
} as const;

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  // TTLs padrão aceitáveis para espectadores (comentado na autonomia de pesquisa)
  private readonly liveTtl = 5; // 5 segundos
  private readonly scheduleTtl = 5; // 5 segundos
  private readonly bracketTtl = 60; // 60 segundos

  /**
   * Dicionário polimórfico de estratégias de mapeamento de fases.
   * Mapeia o tipo da fase (PhaseType) para a sua respectiva função de mapeamento.
   * Garante a conformidade com o Princípio Aberto/Fechado (OCP).
   */
  private readonly phaseMappers: Record<PhaseType, (phase: any, standings: any[]) => any> = {
    [PhaseType.GROUP]: (phase, standings) => toGroupPhaseDto(phase, standings),
    [PhaseType.LEAGUE]: (phase, standings) => toGroupPhaseDto(phase, standings),
    [PhaseType.KNOCKOUT]: (phase) => toKnockoutPhaseDto(phase),
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly singleFlight: SingleFlightService,
  ) {}

  /**
   * Método genérico de orquestração para execução com cache no Redis e concorrência protegida via Single Flight.
   * Evita a duplicação de lógica (violação de DRY) e previne problemas de Cache Stampede.
   *
   * @param key Chave de cache a ser utilizada no Redis.
   * @param ttl Tempo de vida (Time To Live) em segundos do registro em cache.
   * @param fetchFn Função de callback contendo a lógica de banco/processamento que deve ser cacheada.
   */
  private async runWithCache<T>(key: string, ttl: number, fetchFn: () => Promise<T>): Promise<T> {
    const redis = this.redisService.getClient();

    // 1. Tenta obter o valor já cacheado no Redis
    const cached = await redis.get(key);
    if (cached) {
      this.logger.debug(`Cache hit para chave: ${key}`);
      return JSON.parse(cached);
    }

    // 2. Cache miss: executa a função sob o padrão Single Flight para mitigar concorrência agressiva
    return this.singleFlight.do(key, async () => {
      // Dupla checagem sob concorrência para garantir que outro voo simultâneo já não preencheu o cache
      const doubleCheck = await redis.get(key);
      if (doubleCheck) {
        this.logger.debug(`Cache hit na dupla checagem para chave: ${key}`);
        return JSON.parse(doubleCheck);
      }

      const result = await fetchFn();

      // Grava o resultado de volta no cache do Redis
      await redis.set(key, JSON.stringify(result), 'EX', ttl);

      return result;
    });
  }

  /**
   * Valida se a edição de competição especificada existe no banco de dados.
   *
   * @param editionId ID da edição (CompetitionEdition)
   * @throws NotFoundException Caso a edição não exista
   */
  private async validateEdition(editionId: string): Promise<void> {
    const edition = await this.prisma.competitionEdition.findUnique({
      where: { id: editionId },
    });
    if (!edition) {
      throw new NotFoundException(`Edição com ID "${editionId}" não encontrada.`);
    }
  }

  /**
   * Retorna todas as partidas que estão com status LIVE para uma determinada edição.
   * Utiliza Single Flight e cache Redis através do helper genérico runWithCache.
   */
  async getLiveMatches(editionId: string) {
    const cacheKey = getLiveMatchesCacheKey(editionId);

    return this.runWithCache(cacheKey, this.liveTtl, async () => {
      await this.validateEdition(editionId);

      // Busca partidas marcadas com status LIVE
      const liveMatches = await this.prisma.match.findMany({
        where: {
          status: 'LIVE',
          phase: {
            tournament: {
              editionDiscipline: {
                editionId,
              },
            },
          },
        },
        include: MATCH_INCLUDE,
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      // Mapeia e formata os dados de partidas
      return liveMatches.map((match) => toLiveMatchDto(match));
    });
  }

  /**
   * Retorna a agenda de partidas do dia para uma determinada edição.
   * Utiliza Single Flight e cache Redis através do helper genérico runWithCache.
   */
  async getSchedule(editionId: string, date: string) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException('O parâmetro "date" no formato YYYY-MM-DD é obrigatório.');
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('A data fornecida é inválida.');
    }

    const cacheKey = getScheduleCacheKey(editionId, date);

    return this.runWithCache(cacheKey, this.scheduleTtl, async () => {
      await this.validateEdition(editionId);

      const startOfDay = new Date(`${date}T00:00:00.000Z`);
      const endOfDay = new Date(`${date}T23:59:59.999Z`);

      // Busca partidas agendadas dentro do intervalo do dia
      const matches = await this.prisma.match.findMany({
        where: {
          scheduledAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          phase: {
            tournament: {
              editionDiscipline: {
                editionId,
              },
            },
          },
        },
        include: MATCH_INCLUDE,
        orderBy: {
          scheduledAt: 'asc',
        },
      });

      // Mapeia e formata os dados da agenda
      return matches.map((match) => toScheduleMatchDto(match));
    });
  }

  /**
   * Retorna a estrutura de chaveamento completa do torneio, mapeando e agregando os dados
   * das fases e grupos de acordo com a modalidade de disputa de cada fase.
   *
   * @param tournamentId ID do torneio (Tournament) que se deseja buscar a estrutura
   * @throws NotFoundException Caso o torneio fornecido não exista
   * @returns Estrutura agregada do torneio contendo formato e lista de fases mapeadas
   */
  async getBracket(tournamentId: string) {
    const cacheKey = getBracketCacheKey(tournamentId);

    return this.runWithCache(cacheKey, this.bracketTtl, async () => {
      // Valida torneio
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: tournamentId },
      });
      if (!tournament) {
        throw new NotFoundException(`Torneio com ID "${tournamentId}" não encontrado.`);
      }

      // Busca fases
      const phases = await this.prisma.phase.findMany({
        where: { tournamentId },
        orderBy: { order: 'asc' },
        include: {
          groups: {
            include: {
              entries: {
                include: {
                  entry: {
                    include: {
                      team: true,
                      athlete: true,
                    },
                  },
                },
              },
            },
          },
          matches: {
            include: {
              entryA: {
                include: {
                  team: true,
                  athlete: true,
                },
              },
              entryB: {
                include: {
                  team: true,
                  athlete: true,
                },
              },
            },
          },
        },
      });

      // Carrega os standings de todas as fases em uma única query para evitar o problema de performance N+1
      const phaseIds = phases.map((phase) => phase.id);
      const allStandings = await this.prisma.phaseStanding.findMany({
        where: { phaseId: { in: phaseIds } },
        include: {
          entry: {
            include: {
              team: true,
              athlete: true,
            },
          },
        },
        orderBy: [{ rank: 'asc' }, { points: 'desc' }],
      });

      // Agrupa os standings por phaseId na memória
      const standingsByPhaseId = new Map<string, any[]>();
      for (const standing of allStandings) {
        if (!standingsByPhaseId.has(standing.phaseId)) {
          standingsByPhaseId.set(standing.phaseId, []);
        }
        standingsByPhaseId.get(standing.phaseId)!.push(standing);
      }

      // Processa cada fase invocando dinamicamente a estratégia de mapeamento correspondente (OCP)
      const mappedPhases = phases.map((phase) => {
        const mapper = this.phaseMappers[phase.type];
        if (!mapper) {
          throw new BadRequestException(`Tipo de fase "${phase.type}" não suportado pelo sistema.`);
        }
        const standings = standingsByPhaseId.get(phase.id) || [];
        return mapper(phase, standings);
      });

      return {
        format: tournament.format,
        phases: mappedPhases,
      };
    });
  }
}
