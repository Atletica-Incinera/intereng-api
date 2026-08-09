import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MatchEvent, Prisma, Match } from '@prisma/client';
import { CreateMatchEventDto } from './dto/create-match-event.dto';
import { MatchEventMetadataValidator } from '../common/validation/match-event-metadata.validator';
import { DomainEvents, MatchEventCreatedEvent } from '../common/events';
import { ScoringStrategyRegistry } from './strategies/scoring.strategy';

@Injectable()
export class MatchEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findEventsForMatch(matchId: string): Promise<MatchEvent[]> {
    // Verificar se a partida existe
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });
    if (!match) {
      throw new NotFoundException(`Partida com ID "${matchId}" não encontrada.`);
    }

    return this.prisma.matchEvent.findMany({
      where: { matchId },
      orderBy: { sequence: 'asc' },
    });
  }

  /**
   * Acquires a pessimistic write lock (SELECT ... FOR UPDATE) on a Match record
   * within the context of a transaction. Centralizes the lock logic to prevent
   * code duplication (DRY).
   *
   * @param tx - The active Prisma transaction client.
   * @param matchId - The unique identifier of the match to lock.
   * @returns The locked Match entity.
   * @throws NotFoundException if the match does not exist.
   */
  private async lockMatch(tx: Prisma.TransactionClient, matchId: string): Promise<Match> {
    const matches = await tx.$queryRaw<Match[]>`
      SELECT id, "entryAId", "entryBId", "lastEventSequence", "phaseId"
      FROM matches
      WHERE id = ${matchId} FOR UPDATE
    `;
    const match = matches[0];
    if (!match) {
      throw new NotFoundException(`Partida com ID "${matchId}" não encontrada.`);
    }
    return match;
  }

  /**
   * Recalculates the total match scores from its historical events using the
   * registered strategy for the match's discipline. Resolves the OCP violation
   * by delegating the calculation to specialized sports strategy classes.
   *
   * @param events - The complete or remaining list of match events.
   * @param entryAId - The ID of Entry A.
   * @param entryBId - The ID of Entry B.
   * @param disciplineSlug - The discipline slug of the match.
   * @returns An object containing the recalculated scoreA and scoreB.
   */
  private calculateScoresFromEvents(
    events: MatchEvent[],
    entryAId: string | null,
    entryBId: string | null,
    disciplineSlug: string,
  ): { scoreA: number; scoreB: number } {
    const strategy = ScoringStrategyRegistry.getStrategy(disciplineSlug);
    let scoreA = 0;
    let scoreB = 0;

    for (const event of events) {
      if (!event.entryId) continue;

      const isEntryA = event.entryId === entryAId;
      const isEntryB = event.entryId === entryBId;

      if (!isEntryA && !isEntryB) continue;

      const points = strategy.calculateScore(event, isEntryA, isEntryB);
      scoreA += points.pointsA;
      scoreB += points.pointsB;
    }

    return { scoreA, scoreB };
  }

  /**
   * Creates a new match event in a transaction with pessimistic locking,
   * validates metadata according to the sport discipline, and updates
   * the match scores. Emits a domain event on commit.
   *
   * @param matchId - The unique identifier of the match.
   * @param dto - Data transfer object containing event type and metadata.
   * @param staffId - The ID of the staff member performing the operation.
   * @returns The created MatchEvent.
   * @throws NotFoundException if the match or phase cannot be found.
   * @throws BadRequestException if validation checks on entries/athletes fail.
   */
  async createEvent(
    matchId: string,
    dto: CreateMatchEventDto,
    staffId: string,
  ): Promise<MatchEvent> {
    const { createdEvent, scoreA, scoreB } = await this.prisma.$transaction(async (tx) => {
      // 1. Lock pessimista da partida usando método auxiliar centralizado
      const match = await this.lockMatch(tx, matchId);

      // 2. Obter a modalidade (slug) da disciplina e o ID da edição para auditoria e validação
      const phase = await tx.phase.findUnique({
        where: { id: match.phaseId },
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
      });
      if (!phase) {
        throw new NotFoundException('Fase da partida não encontrada.');
      }
      const disciplineSlug = phase.tournament.editionDiscipline.discipline.slug;
      const editionId = phase.tournament.editionDiscipline.editionId;

      // 3. Validar se entryId pertence a partida se informado
      if (dto.entryId) {
        if (dto.entryId !== match.entryAId && dto.entryId !== match.entryBId) {
          throw new BadRequestException('A inscrição informada não faz parte desta partida.');
        }

        // Validar se athleteId pertence à inscrição se informado
        if (dto.athleteId) {
          const entry = await tx.tournamentEntry.findUnique({
            where: { id: dto.entryId },
          });
          if (!entry) {
            throw new BadRequestException('Inscrição não encontrada.');
          }

          if (entry.athleteId) {
            if (entry.athleteId !== dto.athleteId) {
              throw new BadRequestException(
                'O atleta informado não corresponde à inscrição individual.',
              );
            }
          } else if (entry.teamId) {
            const roster = await tx.editionRoster.findFirst({
              where: {
                teamId: entry.teamId,
                athleteId: dto.athleteId,
                editionDiscipline: {
                  editionId,
                  disciplineId: phase.tournament.editionDiscipline.disciplineId,
                },
              },
            });
            if (!roster) {
              throw new BadRequestException(
                'O atleta informado não faz parte do time desta inscrição.',
              );
            }
          }
        }
      }

      // 4. Validar o metadata dinamicamente com base na modalidade e tipo de evento
      const validatedMetadata = MatchEventMetadataValidator.validate(
        disciplineSlug,
        dto.type,
        dto.metadata,
      );

      // 5. Inserir o MatchEvent com sequence = Match.lastEventSequence + 1
      const nextSequence = (match.lastEventSequence || 0) + 1;
      const newEvent = await tx.matchEvent.create({
        data: {
          matchId,
          entryId: dto.entryId || null,
          athleteId: dto.athleteId || null,
          type: dto.type,
          metadata:
            validatedMetadata !== undefined && validatedMetadata !== null
              ? (validatedMetadata as Prisma.InputJsonValue)
              : Prisma.DbNull,
          sequence: nextSequence,
        },
      });

      // 6. Consultar todos os eventos para recalculá-los
      const allEvents = await tx.matchEvent.findMany({
        where: { matchId },
      });

      // 7. Calcular o placar novo usando a estratégia correspondente
      const scores = this.calculateScoresFromEvents(
        allEvents,
        match.entryAId,
        match.entryBId,
        disciplineSlug,
      );

      // 8. Atualizar a partida com os novos scores e lastEventSequence
      await tx.match.update({
        where: { id: matchId },
        data: {
          scoreA: scores.scoreA,
          scoreB: scores.scoreB,
          lastEventSequence: nextSequence,
        },
      });

      // 9. Registrar log de auditoria
      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'MatchEvent',
          entityId: newEvent.id,
          after: newEvent,
        },
        tx,
      );

      return {
        createdEvent: newEvent,
        scoreA: scores.scoreA,
        scoreB: scores.scoreB,
      };
    });

    // 10. Emitir o evento de domínio no barramento após o commit
    this.eventEmitter.emit(
      DomainEvents.MATCH_EVENT_CREATED,
      new MatchEventCreatedEvent(
        matchId,
        createdEvent.id,
        createdEvent.type,
        createdEvent.sequence,
        createdEvent.entryId,
        createdEvent.athleteId,
        createdEvent.metadata,
        scoreA,
        scoreB,
      ),
    );

    return createdEvent;
  }

  /**
   * Deletes a match event in a transaction with pessimistic locking,
   * recalculates the match scores based on the remaining events,
   * and updates the match. Records an audit log on commit.
   *
   * @param matchId - The unique identifier of the match.
   * @param id - The unique identifier of the event to delete.
   * @param staffId - The ID of the staff member performing the operation.
   * @throws NotFoundException if the match, event, or phase cannot be found.
   */
  async deleteEvent(matchId: string, id: string, staffId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // 1. Lock pessimista da partida usando método auxiliar centralizado
      const match = await this.lockMatch(tx, matchId);

      // 2. Verificar se o evento existe e pertence à partida
      const event = await tx.matchEvent.findUnique({
        where: { id },
      });
      if (!event || event.matchId !== matchId) {
        throw new NotFoundException(`Evento com ID "${id}" não encontrado nesta partida.`);
      }

      // 3. Obter ID da edição e modalidade (slug) da disciplina para auditoria e recalcular scores
      const phase = await tx.phase.findUnique({
        where: { id: match.phaseId },
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
      });
      if (!phase) {
        throw new NotFoundException('Fase da partida não encontrada.');
      }
      const editionId = phase.tournament.editionDiscipline.editionId;
      const disciplineSlug = phase.tournament.editionDiscipline.discipline.slug;

      // 4. Deletar o evento
      await tx.matchEvent.delete({
        where: { id },
      });

      // 5. Consultar os eventos remanescentes
      const remainingEvents = await tx.matchEvent.findMany({
        where: { matchId },
      });

      // 6. Recalcular scores usando a estratégia do esporte correspondente
      const { scoreA, scoreB } = this.calculateScoresFromEvents(
        remainingEvents,
        match.entryAId,
        match.entryBId,
        disciplineSlug,
      );

      // 7. Determinar a nova lastEventSequence
      const lastSequence =
        remainingEvents.length > 0 ? Math.max(...remainingEvents.map((e) => e.sequence)) : 0;

      // 8. Atualizar partida com novos scores e lastEventSequence
      await tx.match.update({
        where: { id: matchId },
        data: {
          scoreA,
          scoreB,
          lastEventSequence: lastSequence,
        },
      });

      // 9. Registrar log de auditoria
      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'DELETE',
          entityType: 'MatchEvent',
          entityId: id,
          before: event,
        },
        tx,
      );
    });
  }
}
