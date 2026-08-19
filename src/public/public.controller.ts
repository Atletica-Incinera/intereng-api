import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ActiveEditionResolver } from '../edition-snapshots/active-edition.resolver';
import { SnapshotEnvelopeDto } from '../edition-snapshots/dto/frontend-snapshot.dto';
import { EditionSnapshotsService } from '../edition-snapshots/edition-snapshots.service';
import { respondWithSnapshot } from '../edition-snapshots/snapshot-http';
import { PrismaService } from '../common/prisma/prisma.service';
import { PublicService } from './public.service';

@Controller()
export class PublicController {
  constructor(
    private readonly editionSnapshotsService: EditionSnapshotsService,
    private readonly publicService: PublicService,
    private readonly activeEdition: ActiveEditionResolver,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Troca o alias `active` pelo ID real antes de qualquer leitura.
   *
   * A resolução acontece aqui, e não dentro do service, porque as respostas são
   * cacheadas por ID de edição: guardar sob a chave literal `active` faria o
   * cache continuar servindo a edição anterior depois de uma troca.
   */
  private async resolveEditionId(editionId: string): Promise<string> {
    if (editionId !== 'active') return editionId;
    const edition = await this.activeEdition.resolve(this.prisma, editionId);
    return edition.id;
  }

  @Get('editions/:editionId/public-snapshot')
  async getPublicSnapshot(
    @Param('editionId') editionId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SnapshotEnvelopeDto | undefined> {
    const result = await this.editionSnapshotsService.getPublicSnapshot(editionId);
    return respondWithSnapshot(response, ifNoneMatch, result, 'public, no-cache');
  }

  @Get('editions/:editionId/live')
  async getLiveMatches(@Param('editionId') editionId: string) {
    return this.publicService.getLiveMatches(await this.resolveEditionId(editionId));
  }

  @Get('editions/:editionId/schedule')
  async getSchedule(@Param('editionId') editionId: string, @Query('date') date: string) {
    return this.publicService.getSchedule(await this.resolveEditionId(editionId), date);
  }

  @Get('tournaments/:id/bracket')
  async getBracket(@Param('id') tournamentId: string) {
    return this.publicService.getBracket(tournamentId);
  }
}
