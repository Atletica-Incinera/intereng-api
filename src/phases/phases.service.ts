import { randomUUID } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CreatePhaseDto } from './dto/create-phase.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { CreateGroupEntryDto } from './dto/create-group-entry.dto';
import { PhaseConfigValidator } from '../common/validation/phase-config.validator';
import { Phase, Group, GroupEntry, Prisma } from '@prisma/client';

@Injectable()
export class PhasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to verify if a tournament exists and return its editionId.
   */
  private async getTournamentEditionId(tournamentId: string): Promise<string> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        editionDiscipline: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException(`Torneio com ID "${tournamentId}" não encontrado.`);
    }
    return tournament.editionDiscipline.editionId;
  }

  /**
   * Helper to retrieve a group with its phase, tournament and edition relationship.
   * Ensures that the group exists and returns the hydrated entity.
   */
  private async getGroupWithEdition(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        phase: {
          include: {
            tournament: {
              include: { editionDiscipline: true },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Grupo com ID "${groupId}" não encontrado.`);
    }

    return group;
  }

  /**
   * Retrieves all phases for a given tournament, ordered by order.
   */
  async findAllPhases(tournamentId: string): Promise<Phase[]> {
    await this.getTournamentEditionId(tournamentId);

    return this.prisma.phase.findMany({
      where: { tournamentId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Creates a new phase for a tournament.
   */
  async createPhase(tournamentId: string, dto: CreatePhaseDto, staffId: string): Promise<Phase> {
    const editionId = await this.getTournamentEditionId(tournamentId);

    // Validate the dynamic JSON config shape based on the phase type
    const validatedConfig = PhaseConfigValidator.validate(dto.type, dto.config);
    const clientId = dto.clientId?.trim() || randomUUID();

    // Check unique constraints for [tournamentId, order] and [tournamentId, clientId]
    const [existingPhase, existingClientId] = await Promise.all([
      this.prisma.phase.findUnique({
        where: {
          tournamentId_order: {
            tournamentId,
            order: dto.order,
          },
        },
      }),
      this.prisma.phase.findUnique({
        where: { tournamentId_clientId: { tournamentId, clientId } },
      }),
    ]);
    if (existingPhase) {
      throw new ConflictException(`Já existe uma fase com a ordem "${dto.order}" neste torneio.`);
    }
    if (existingClientId) {
      throw new ConflictException(
        `Já existe uma fase com o identificador "${clientId}" neste torneio.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const phase = await tx.phase.create({
        data: {
          tournamentId,
          clientId,
          order: dto.order,
          name: dto.name,
          type: dto.type,
          config: validatedConfig as Prisma.InputJsonValue,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'Phase',
          entityId: phase.id,
          after: phase,
        },
        tx,
      );

      return phase;
    });
  }

  /**
   * Creates a new group inside a phase.
   */
  async createGroup(phaseId: string, dto: CreateGroupDto, staffId: string): Promise<Group> {
    const phase = await this.prisma.phase.findUnique({
      where: { id: phaseId },
      include: {
        tournament: {
          include: { editionDiscipline: true },
        },
      },
    });

    if (!phase) {
      throw new NotFoundException(`Fase com ID "${phaseId}" não encontrada.`);
    }

    const editionId = phase.tournament.editionDiscipline.editionId;

    // Check unique constraint [phaseId, name]
    const existingGroup = await this.prisma.group.findUnique({
      where: {
        phaseId_name: {
          phaseId,
          name: dto.name,
        },
      },
    });
    if (existingGroup) {
      throw new ConflictException(`Já existe um grupo com o nome "${dto.name}" nesta fase.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          phaseId,
          name: dto.name,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'Group',
          entityId: group.id,
          after: group,
        },
        tx,
      );

      return group;
    });
  }

  /**
   * Adds an entry to a group.
   */
  async createGroupEntry(
    groupId: string,
    dto: CreateGroupEntryDto,
    staffId: string,
  ): Promise<GroupEntry> {
    const group = await this.getGroupWithEdition(groupId);

    const editionId = group.phase.tournament.editionDiscipline.editionId;
    const tournamentId = group.phase.tournamentId;

    // Verify if the TournamentEntry exists
    const entry = await this.prisma.tournamentEntry.findUnique({
      where: { id: dto.entryId },
    });

    if (!entry) {
      throw new NotFoundException(`Entrada com ID "${dto.entryId}" não encontrada.`);
    }

    // Verify if the TournamentEntry belongs to the same tournament as the Group/Phase
    if (entry.tournamentId !== tournamentId) {
      throw new BadRequestException('A entrada fornecida pertence a outro torneio.');
    }

    // Check unique constraint [groupId, entryId]
    const existingEntry = await this.prisma.groupEntry.findUnique({
      where: {
        groupId_entryId: {
          groupId,
          entryId: dto.entryId,
        },
      },
    });
    if (existingEntry) {
      throw new ConflictException('Esta entrada já está alocada neste grupo.');
    }

    return this.prisma.$transaction(async (tx) => {
      const groupEntry = await tx.groupEntry.create({
        data: {
          groupId,
          entryId: dto.entryId,
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'CREATE',
          entityType: 'GroupEntry',
          entityId: groupEntry.id,
          after: groupEntry,
        },
        tx,
      );

      return groupEntry;
    });
  }

  /**
   * Removes an entry from a group.
   */
  async deleteGroupEntry(groupId: string, entryId: string, staffId: string): Promise<void> {
    const group = await this.getGroupWithEdition(groupId);

    const editionId = group.phase.tournament.editionDiscipline.editionId;

    // Check if the relation exists
    const groupEntry = await this.prisma.groupEntry.findUnique({
      where: {
        groupId_entryId: {
          groupId,
          entryId,
        },
      },
    });

    if (!groupEntry) {
      throw new NotFoundException(
        `Associação de entrada com ID "${entryId}" no grupo "${groupId}" não encontrada.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.groupEntry.delete({
        where: {
          groupId_entryId: {
            groupId,
            entryId,
          },
        },
      });

      await this.audit.record(
        {
          staffId,
          editionId,
          action: 'DELETE',
          entityType: 'GroupEntry',
          entityId: groupEntry.id,
          before: groupEntry,
        },
        tx,
      );
    });
  }
}
