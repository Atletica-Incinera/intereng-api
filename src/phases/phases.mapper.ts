import { Phase, Group, GroupEntry } from '@prisma/client';

export function toPhaseResponseDto(phase: Phase) {
  return {
    id: phase.id,
    clientId: phase.clientId,
    tournamentId: phase.tournamentId,
    order: phase.order,
    name: phase.name,
    type: phase.type,
    config: phase.config,
    createdAt: phase.createdAt,
  };
}

export function toGroupResponseDto(group: Group) {
  return {
    id: group.id,
    phaseId: group.phaseId,
    name: group.name,
    createdAt: group.createdAt,
  };
}

export function toGroupEntryResponseDto(entry: GroupEntry) {
  return {
    id: entry.id,
    groupId: entry.groupId,
    entryId: entry.entryId,
  };
}
