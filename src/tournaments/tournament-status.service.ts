import { Injectable } from '@nestjs/common';
import {
  TOURNAMENT_STATUS_TRANSITIONS,
  TournamentStatus,
} from './constants/tournament-status-transitions';

/**
 * Service responsible for providing allowed status transitions for a tournament.
 * This isolates the transition map from the business service, adhering to the Open/Closed Principle.
 */
@Injectable()
export class TournamentStatusService {
  /**
   * Returns the list of allowed next statuses for a given current status.
   * @param current The current TournamentStatus.
   */
  getAllowedTransitions(current: TournamentStatus): readonly TournamentStatus[] {
    return TOURNAMENT_STATUS_TRANSITIONS[current] ?? [];
  }
}
