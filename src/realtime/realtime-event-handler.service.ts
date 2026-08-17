import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvents, MatchEventCreatedEvent } from '../common/events';
import { RealtimeService } from './realtime.service';

/**
 * Service responsible for handling domain events related to match events.
 * It delegates the event persistence to the RealtimeService.
 */
@Injectable()
export class RealtimeEventHandlerService {
  constructor(private readonly realtimeService: RealtimeService) {}

  /**
   * Handles a {@link MatchEventCreatedEvent} emitted by the application.
   * Extracts the matchId and forwards the event payload to the RealtimeService.
   *
   * @param event The match event created domain event containing matchId, eventId, type, sequence, and other metadata.
   */
  @OnEvent(DomainEvents.MATCH_EVENT_CREATED)
  async handleMatchEventCreated(event: MatchEventCreatedEvent): Promise<void> {
    // Destructure to separate matchId (used as key) from the event payload
    const { matchId, ...eventPayload } = event;

    await this.realtimeService.publishMatchEvent(matchId, eventPayload);
  }
}
