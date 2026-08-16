import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { DomainEvents, MatchFinishedEvent, MatchEventCreatedEvent } from '../common/events';
import {
  getLiveMatchesCacheKey,
  getBracketCacheKey,
  getScheduleWildcardCacheKey,
} from './public-cache.keys';

@Injectable()
export class PublicCacheListener {
  private readonly logger = new Logger(PublicCacheListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Event Listener para término de partida: limpa os caches relevantes
   */
  @OnEvent(DomainEvents.MATCH_FINISHED)
  async handleMatchFinished(event: MatchFinishedEvent) {
    this.logger.log(
      `[DomainEvent: MATCH_FINISHED] Invalidando cache para matchId: ${event.matchId}`,
    );
    await this.invalidateCacheForMatch(event.matchId);
  }

  /**
   * Event Listener para novos eventos de partida (ex: gol, placar mudando): limpa os caches
   */
  @OnEvent(DomainEvents.MATCH_EVENT_CREATED)
  async handleMatchEventCreated(event: MatchEventCreatedEvent) {
    this.logger.log(
      `[DomainEvent: MATCH_EVENT_CREATED] Invalidando cache para matchId: ${event.matchId}`,
    );
    await this.invalidateCacheForMatch(event.matchId);
  }

  /**
   * Busca a edição e o torneio associado à partida para invalidar seus caches
   */
  async invalidateCacheForMatch(matchId: string) {
    try {
      const match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          phase: {
            include: {
              tournament: {
                include: {
                  editionDiscipline: true,
                },
              },
            },
          },
        },
      });

      if (!match) {
        return;
      }

      const editionId = match.phase.tournament.editionDiscipline.editionId;
      const tournamentId = match.phase.tournament.id;
      const redis = this.redisService.getClient();

      // Deleta cache do /live
      await redis.del(getLiveMatchesCacheKey(editionId));

      // Deleta cache do /bracket
      await redis.del(getBracketCacheKey(tournamentId));

      // Deleta todas as chaves de /schedule dessa edição
      const keys = await redis.keys(getScheduleWildcardCacheKey(editionId));
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      this.logger.error(`Erro ao invalidar cache para partida ${matchId}:`, err);
    }
  }
}
