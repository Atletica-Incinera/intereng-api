import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MatchEventSide, MatchStatus, PhaseType, Prisma } from '@prisma/client';
import {
  actionArray,
  actionDate,
  actionEnum,
  actionId,
  actionNumber,
  actionObject,
  actionString,
  actionTime,
  optionalActionBoolean,
  optionalActionNumber,
  optionalActionString,
  requireActionReason,
  scheduledAt,
  toInputJson,
} from '../action-validation';
import { mapEventSide, mapEventType, mapMatchStatus, MATCH_STATUS_VALUES } from '../action-mappers';
import {
  ActionRegulation,
  normalizedLabel,
  regulationPeriodCount,
  resolveActionRegulation,
  setWinner,
} from '../action-regulation';
import { EditionActionAuditDto } from '../dto/edition-action.dto';
import { EditionActionRecalculationService } from '../edition-action-recalculation.service';
import { ActionMutationResult, EditionActionContext } from '../edition-actions.types';

const MATCH_FIELDS = [
  'date',
  'time',
  'venue',
  'status',
  'reason',
  'scoreA',
  'scoreB',
  'created',
  'editionId',
  'discipline',
  'entryA',
  'entryB',
  'logoA',
  'logoB',
  'phase',
  'tournamentId',
  'rules',
  'currentPeriod',
  'clockSeconds',
  'runningSince',
  'paused',
  'events',
  'operatorId',
  'operatorName',
  'operatorHeartbeat',
  'periodScoreA',
  'periodScoreB',
  'periodResults',
  'startedAt',
  'startedBy',
  'startNote',
  'tiebreak',
  'corrections',
  'walkoverWinner',
] as const;
const CLOCK_FIELDS = [
  'status',
  'currentPeriod',
  'clockSeconds',
  'runningSince',
  'paused',
  'periodScoreA',
  'periodScoreB',
  'periodResults',
] as const;
const EVENT_FIELDS = [
  'id',
  'at',
  'elapsedSeconds',
  'period',
  'periodElapsedSeconds',
  'type',
  'detail',
  'side',
  'scoreA',
  'scoreB',
  'previousScoreA',
  'previousScoreB',
  'points',
  'previous',
  'athleteId',
] as const;
const SCORE_PATCH_FIELDS = [
  'status',
  'scoreA',
  'scoreB',
  'periodScoreA',
  'periodScoreB',
  'currentPeriod',
] as const;
const FINISH_FIELDS = [
  'status',
  'paused',
  'runningSince',
  'clockSeconds',
  'currentPeriod',
  'scoreA',
  'scoreB',
  'tiebreak',
] as const;
/**
 * Desvio máximo tolerado entre o relógio do aparelho e o do servidor.
 *
 * Quinze minutos cobre com folga o erro de um telefone sem sincronização
 * automática e ainda barra a data claramente errada — que é o caso em que
 * confiar no cliente gravaria um cronômetro com horas de jogo já corridas.
 */
const MAX_CLIENT_CLOCK_SKEW_MS = 15 * 60 * 1000;

const OPERATOR_LOCK_MS = 120_000;

interface StoredMatchContext {
  id: string;
  phaseId: string;
  round: number | null;
  bracketSlot: number | null;
  entryAId: string | null;
  entryBId: string | null;
  scoreA: number;
  scoreB: number;
  currentPeriod: number;
  clockSeconds: number;
  paused: boolean;
  periodScoreA: number;
  periodScoreB: number;
  runningSince: Date | null;
  status: MatchStatus;
  scheduledAt: Date | null;
  venue: string | null;
  lastEventSequence: number;
  operatorId: string | null;
  operatorDeviceId: string | null;
  operatorHeartbeat: Date | null;
  tiebreak: Prisma.JsonValue | null;
  phase: {
    type: PhaseType;
    tournamentId: string;
    tournament: {
      editionDisciplineId: string;
      editionDiscipline: {
        editionId: string;
        config: Prisma.JsonValue | null;
        discipline: { name: string };
      };
    };
  };
}

@Injectable()
export class MatchActionHandler {
  constructor(private readonly recalculation: EditionActionRecalculationService) {}

  async schedule(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'match']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const match = actionObject(payload.match, 'A partida', MATCH_FIELDS);
    if (await context.transaction.match.findUnique({ where: { id }, select: { id: true } })) {
      throw new ConflictException('Já existe uma partida com o ID informado.');
    }
    const tournamentId = actionId(match, 'tournamentId', 'O ID da categoria');
    const editionId = actionId(match, 'editionId', 'O ID da edição');
    if (editionId !== context.edition.id) {
      throw new ConflictException('A partida deve pertencer à edição da rota.');
    }
    const tournament = await this.tournamentContext(context, tournamentId);
    const discipline = actionString(match, 'discipline', 'A modalidade da partida', {
      min: 2,
      max: 100,
    });
    if (discipline !== tournament.disciplineName) {
      throw new ConflictException('A modalidade da partida não corresponde à categoria.');
    }
    const status = actionEnum(match, 'status', 'O status da partida', MATCH_STATUS_VALUES);
    if (status !== 'Agendada') {
      throw new ConflictException('Uma nova partida deve ser criada com o status Agendada.');
    }
    const phaseName = actionString(match, 'phase', 'A fase da partida', { min: 1, max: 160 });
    const phase = await this.phaseContext(context.transaction, tournamentId, phaseName);
    const entryA = actionString(match, 'entryA', 'O participante A', { min: 1, max: 180 });
    const entryB = actionString(match, 'entryB', 'O participante B', { min: 1, max: 180 });
    if (entryA === entryB) throw new ConflictException('Os participantes devem ser diferentes.');
    const [entryAId, entryBId] = await Promise.all([
      this.entryByName(context.transaction, tournamentId, entryA),
      this.entryByName(context.transaction, tournamentId, entryB),
    ]);
    const date = actionDate(match, 'date', 'A data da partida');
    const time = actionTime(match, 'time', 'O horário da partida');
    const venue = actionString(match, 'venue', 'O local da partida', { min: 2, max: 200 });

    await context.transaction.match.create({
      data: {
        id,
        phaseId: phase.phaseId,
        groupId: phase.groupId,
        entryAId,
        entryBId,
        status: MatchStatus.SCHEDULED,
        scheduledAt: scheduledAt(date, time),
        venue,
        scoreA: 0,
        scoreB: 0,
        currentPeriod: 1,
        clockSeconds: 0,
        paused: true,
        periodScoreA: 0,
        periodScoreB: 0,
      },
    });
    return {
      entityType: 'Match',
      entityId: id,
      editionDisciplineId: tournament.editionDisciplineId,
    };
  }

  async update(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch', 'cascade']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const patch = actionObject(payload.patch, 'A alteração da partida', MATCH_FIELDS);
    optionalActionBoolean(payload, 'cascade', 'A atualização em cascata');
    const match = await this.matchOrThrow(context, id);
    const requestedStatus =
      patch.status === undefined
        ? undefined
        : mapMatchStatus(actionEnum(patch, 'status', 'O status da partida', MATCH_STATUS_VALUES));
    if (requestedStatus && !this.canTransition(match.status, requestedStatus)) {
      throw new ConflictException('A transição de status da partida não é permitida.');
    }

    const currentDate = match.scheduledAt?.toISOString().slice(0, 10);
    const currentTime = match.scheduledAt?.toISOString().slice(11, 16);
    const date =
      patch.date === undefined ? currentDate : actionDate(patch, 'date', 'A data da partida');
    const time =
      patch.time === undefined ? currentTime : actionTime(patch, 'time', 'O horário da partida');
    const venue = optionalActionString(patch, 'venue', 'O local da partida', { min: 2, max: 200 });
    const reason = optionalActionString(patch, 'reason', 'O motivo da alteração', {
      min: 5,
      max: 1_000,
    });
    const walkoverWinner = optionalActionString(patch, 'walkoverWinner', 'O vencedor do W.O.', {
      min: 1,
      max: 180,
    });
    let scoreA: number | undefined;
    let scoreB: number | undefined;
    let winnerEntryId: string | null | undefined;
    let walkoverWinnerEntryId: string | null | undefined;

    if (requestedStatus === MatchStatus.WALKOVER) {
      const requiredReason = reason ?? requireActionReason(audit, 'A aplicação de W.O.');
      if (!walkoverWinner) throw new ConflictException('Informe o vencedor do W.O.');
      const winner = await this.entryByName(
        context.transaction,
        match.phase.tournamentId,
        walkoverWinner,
      );
      if (winner !== match.entryAId && winner !== match.entryBId) {
        throw new ConflictException('O vencedor do W.O. deve ser um participante da partida.');
      }
      const walkover = this.walkoverScore(match.phase.tournament.editionDiscipline.config);
      scoreA = winner === match.entryAId ? walkover.winner : walkover.loser;
      scoreB = winner === match.entryBId ? walkover.winner : walkover.loser;
      winnerEntryId = winner;
      walkoverWinnerEntryId = winner;
      patch.reason = requiredReason;
    } else if (patch.scoreA !== undefined || patch.scoreB !== undefined) {
      throw new ConflictException(
        'O placar só pode ser alterado por eventos, W.O. ou retificação.',
      );
    }

    await context.transaction.match.update({
      where: { id },
      data: {
        ...(requestedStatus ? { status: requestedStatus } : {}),
        ...(date && time && (patch.date !== undefined || patch.time !== undefined)
          ? { scheduledAt: scheduledAt(date, time) }
          : {}),
        ...(venue !== undefined ? { venue } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(scoreA !== undefined ? { scoreA } : {}),
        ...(scoreB !== undefined ? { scoreB } : {}),
        ...(winnerEntryId !== undefined ? { winnerEntryId } : {}),
        ...(walkoverWinnerEntryId !== undefined ? { walkoverWinnerEntryId } : {}),
      },
    });
    if (requestedStatus === MatchStatus.WALKOVER) {
      await this.recalculation.recomputeTournament(context.transaction, match.phase.tournamentId);
    }
    return this.result(match, id);
  }

  async start(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const patch = actionObject(payload.patch, 'A confirmação de início', MATCH_FIELDS);
    const match = await this.matchOrThrow(context, id);
    const operatorDeviceId = this.requireOperatorDeviceId(context);
    const requestedOperatorDeviceId = optionalActionString(
      patch,
      'operatorId',
      'O identificador do dispositivo operador',
      { min: 1, max: 128 },
    );
    if (requestedOperatorDeviceId && requestedOperatorDeviceId !== operatorDeviceId) {
      throw new ConflictException(
        'O dispositivo informado na partida n\u00e3o corresponde ao dispositivo autenticado.',
      );
    }
    if (match.status !== MatchStatus.SCHEDULED && match.status !== MatchStatus.POSTPONED) {
      throw new ConflictException('A partida não pode ser iniciada no status atual.');
    }
    if (patch.status !== undefined) {
      const status = mapMatchStatus(
        actionEnum(patch, 'status', 'O status da partida', MATCH_STATUS_VALUES),
      );
      if (status !== MatchStatus.LIVE) {
        throw new ConflictException('A confirmação de início deve colocar a partida Ao vivo.');
      }
    }
    const startNote =
      optionalActionString(patch, 'startNote', 'A justificativa do início', {
        min: 5,
        max: 1_000,
      }) ?? audit?.reason?.trim();
    const regulation = resolveActionRegulation(
      match.phase.tournament.editionDiscipline.discipline.name,
      match.phase.tournament.editionDiscipline.config,
    );
    const startedAt = new Date();
    const hasClock = regulation.clockMode !== 'none';
    // O cronômetro corre no aparelho do mesário: a tela calcula o decorrido como
    // `Date.now() - runningSince`. Carimbar o início aqui misturava as duas
    // fontes, e a diferença virava o tempo já corrido no instante em que a
    // partida começa. Num aparelho adiantado mais que a duração da etapa, o
    // relógio nascia estourado, o fim de período disparava na hora e o primeiro
    // tempo terminava antes de começar — para o mesário e para quem assiste.
    //
    // Todas as outras transições (pausar, retomar, avançar etapa, prorrogação)
    // já gravam o carimbo do cliente, em `updateClock`. Aceitar aqui também é o
    // que deixa a conta inteira na mesma base de tempo.
    const clientRunningSince = this.acceptClientClockStart(patch, startedAt);
    const updated = await context.transaction.match.updateMany({
      where: {
        id,
        status: { in: [MatchStatus.SCHEDULED, MatchStatus.POSTPONED] },
        OR: [
          { operatorId: null },
          { operatorId: context.user.id, operatorDeviceId },
          { operatorHeartbeat: null },
          { operatorHeartbeat: { lt: new Date(startedAt.getTime() - OPERATOR_LOCK_MS) } },
        ],
      },
      data: {
        status: MatchStatus.LIVE,
        startedAt,
        startedById: context.user.id,
        startNote: startNote || null,
        paused: false,
        runningSince: hasClock ? clientRunningSince : null,
        operatorId: context.user.id,
        operatorDeviceId,
        operatorName: context.actorName,
        operatorHeartbeat: startedAt,
      },
    });
    if (!updated.count) {
      throw new ConflictException('A partida est\u00e1 sendo operada por outro dispositivo.');
    }
    return this.result(match, id);
  }

  async updateClock(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const patch = actionObject(payload.patch, 'A alteração do cronômetro', CLOCK_FIELDS);
    const match = await this.matchOrThrow(context, id);
    if (match.status !== MatchStatus.LIVE) {
      throw new ConflictException('O cronômetro só pode ser alterado em uma partida Ao vivo.');
    }
    this.assertOperator(match, context);
    if (patch.status !== undefined) {
      const status = mapMatchStatus(
        actionEnum(patch, 'status', 'O status da partida', MATCH_STATUS_VALUES),
      );
      if (status !== MatchStatus.LIVE) {
        throw new ConflictException('O cronômetro não pode alterar o status da partida.');
      }
    }
    const currentPeriod = optionalActionNumber(patch, 'currentPeriod', 'A etapa atual', {
      min: 1,
      max: 100,
    });
    const clockSeconds = optionalActionNumber(patch, 'clockSeconds', 'O tempo do cronômetro', {
      min: 0,
      max: 86_400,
    });
    const periodScoreA = optionalActionNumber(
      patch,
      'periodScoreA',
      'O placar da etapa do participante A',
      { min: 0, max: 100_000 },
    );
    const periodScoreB = optionalActionNumber(
      patch,
      'periodScoreB',
      'O placar da etapa do participante B',
      { min: 0, max: 100_000 },
    );
    const paused = optionalActionBoolean(patch, 'paused', 'A pausa do cronômetro');
    const runningSince =
      patch.runningSince === undefined
        ? undefined
        : patch.runningSince === null
          ? null
          : new Date(
              actionString(patch, 'runningSince', 'O início do cronômetro', {
                min: 10,
                max: 80,
              }),
            );
    if (runningSince instanceof Date && Number.isNaN(runningSince.getTime())) {
      throw new ConflictException('O início do cronômetro deve ser uma data válida.');
    }
    const regulation = resolveActionRegulation(
      match.phase.tournament.editionDiscipline.discipline.name,
      match.phase.tournament.editionDiscipline.config,
    );
    const hasClock = regulation.clockMode !== 'none';
    if (hasClock && paused === false && !(runningSince instanceof Date)) {
      throw new ConflictException('Ao retomar o cronômetro, informe um horário de início válido.');
    }
    const effectivePaused = hasClock ? paused : false;
    const effectiveRunningSince = !hasClock || effectivePaused === true ? null : runningSince;
    const requestedPeriod = currentPeriod ?? match.currentPeriod;
    if (requestedPeriod < match.currentPeriod || requestedPeriod > match.currentPeriod + 1) {
      throw new ConflictException('A etapa só pode permanecer igual ou avançar uma posição.');
    }
    const advancesPeriod = requestedPeriod === match.currentPeriod + 1;
    let derivedPeriodResult: { period: number; scoreA: number; scoreB: number } | undefined;
    if (advancesPeriod) {
      if (regulation.completion.mode === 'sets') {
        throw new ConflictException(
          'Em modalidades por sets, a etapa avança somente pelo evento que encerra o set.',
        );
      }
      const maximumPeriod =
        regulationPeriodCount(regulation) +
        (regulation.completion.mode === 'periods' ? regulation.completion.overtimePeriods : 0);
      if (requestedPeriod > maximumPeriod) {
        throw new ConflictException('A etapa solicitada excede o regulamento da modalidade.');
      }
      if (periodScoreA !== 0 || periodScoreB !== 0) {
        throw new ConflictException(
          'Ao avançar a etapa, os placares parciais devem ser reiniciados em 0 × 0.',
        );
      }
      derivedPeriodResult = {
        period: match.currentPeriod,
        scoreA: match.periodScoreA,
        scoreB: match.periodScoreB,
      };
    } else if (
      (periodScoreA !== undefined && periodScoreA !== match.periodScoreA) ||
      (periodScoreB !== undefined && periodScoreB !== match.periodScoreB)
    ) {
      throw new ConflictException('O placar parcial diverge do valor calculado pelo servidor.');
    }
    await this.assertClockPeriodResults(
      context.transaction,
      id,
      patch.periodResults,
      derivedPeriodResult,
    );
    if (derivedPeriodResult) {
      await context.transaction.matchPeriodResult.upsert({
        where: {
          matchId_period: { matchId: id, period: derivedPeriodResult.period },
        },
        create: { matchId: id, ...derivedPeriodResult },
        update: {
          scoreA: derivedPeriodResult.scoreA,
          scoreB: derivedPeriodResult.scoreB,
        },
      });
    }
    await context.transaction.match.update({
      where: { id },
      data: {
        ...(currentPeriod !== undefined && currentPeriod !== null
          ? { currentPeriod: requestedPeriod }
          : {}),
        ...(clockSeconds !== undefined && clockSeconds !== null ? { clockSeconds } : {}),
        ...(periodScoreA !== undefined && periodScoreA !== null
          ? { periodScoreA: advancesPeriod ? 0 : match.periodScoreA }
          : {}),
        ...(periodScoreB !== undefined && periodScoreB !== null
          ? { periodScoreB: advancesPeriod ? 0 : match.periodScoreB }
          : {}),
        ...(effectivePaused !== undefined ? { paused: effectivePaused } : {}),
        ...(effectiveRunningSince !== undefined ? { runningSince: effectiveRunningSince } : {}),
      },
    });
    return this.result(match, id);
  }

  async registerEvent(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'event', 'patch', 'periodResult']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const event = actionObject(payload.event, 'O evento', EVENT_FIELDS);
    const patch = actionObject(payload.patch, 'A alteração de placar', SCORE_PATCH_FIELDS);
    const match = await this.matchOrThrow(context, id);
    if (match.status !== MatchStatus.LIVE) {
      throw new ConflictException('Eventos só podem ser registrados em uma partida Ao vivo.');
    }
    this.assertOperator(match, context);
    const eventId = actionId(event, 'id', 'O ID do evento');
    if (
      await context.transaction.matchEvent.findUnique({
        where: { id: eventId },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Já existe um evento com o ID informado.');
    }
    const typeLabel = actionString(event, 'type', 'O tipo do evento', { min: 1, max: 100 });
    const detail = actionString(event, 'detail', 'O detalhe do evento', { min: 1, max: 500 });
    const sideLabel = actionEnum(event, 'side', 'O lado do evento', [
      'home',
      'away',
      'neutral',
    ] as const);
    const side = mapEventSide(sideLabel);
    const elapsedSeconds = actionNumber(event, 'elapsedSeconds', 'O tempo do evento', {
      min: 0,
      max: 86_400,
    });
    const period = optionalActionNumber(event, 'period', 'A etapa do evento', { min: 1, max: 100 });
    const periodElapsedSeconds = optionalActionNumber(
      event,
      'periodElapsedSeconds',
      'O tempo da etapa',
      { min: 0, max: 86_400 },
    );
    const clientPoints = optionalActionNumber(event, 'points', 'Os pontos do evento', {
      min: 0,
      max: 1_000,
    });
    const regulation = resolveActionRegulation(
      match.phase.tournament.editionDiscipline.discipline.name,
      match.phase.tournament.editionDiscipline.config,
    );
    const normalizedType = normalizedLabel(typeLabel);
    const scoringRule = regulation.scoring.find(
      (item) => normalizedLabel(item.label) === normalizedType,
    );
    const secondaryRule = regulation.secondary.find(
      (item) => normalizedLabel(item.label) === normalizedType,
    );
    const declarativeResult =
      (regulation.completion.mode === 'board' || regulation.completion.mode === 'result') &&
      normalizedType === normalizedLabel(`Resultado da ${regulation.periodLabel}`);
    if (!scoringRule && !secondaryRule && !declarativeResult) {
      throw new ConflictException(
        `O evento "${typeLabel}" não está configurado no regulamento da modalidade.`,
      );
    }
    if (scoringRule && sideLabel === 'neutral') {
      throw new ConflictException('Um evento de pontuação deve indicar um participante.');
    }
    if (secondaryRule?.requiresSide && sideLabel === 'neutral') {
      throw new ConflictException(
        `O evento "${secondaryRule.label}" deve indicar um participante.`,
      );
    }
    const hasClock = regulation.clockMode !== 'none';
    if ((scoringRule || declarativeResult) && hasClock && match.paused) {
      throw new ConflictException(
        `O evento "${scoringRule?.label ?? typeLabel}" não pode pontuar com o relógio parado.`,
      );
    }
    if (secondaryRule && hasClock && !secondaryRule.allowedWhenStopped && match.paused) {
      throw new ConflictException(
        `O evento "${secondaryRule.label}" não pode ser registrado com o relógio parado.`,
      );
    }
    const eventPoints = scoringRule?.points ?? secondaryRule?.scorePoints ?? 0;
    if (sideLabel === 'neutral' && eventPoints > 0) {
      throw new ConflictException('Um evento neutro não pode alterar o placar.');
    }
    if (clientPoints !== undefined && clientPoints !== eventPoints) {
      throw new ConflictException(
        `A pontuação do evento diverge do regulamento: esperado ${eventPoints}.`,
      );
    }
    if (period !== undefined && period !== match.currentPeriod) {
      throw new ConflictException('A etapa do evento não corresponde à etapa atual da partida.');
    }

    let scoreA = match.scoreA;
    let scoreB = match.scoreB;
    let periodScoreA = match.periodScoreA;
    let periodScoreB = match.periodScoreB;
    let currentPeriod = match.currentPeriod;
    let derivedPeriodResult: { period: number; scoreA: number; scoreB: number } | undefined;
    if (declarativeResult) {
      const result = this.declarativeScore(regulation, sideLabel);
      scoreA = result.scoreA;
      scoreB = result.scoreB;
    } else if (eventPoints > 0) {
      const nextPeriodA = periodScoreA + (sideLabel === 'home' ? eventPoints : 0);
      const nextPeriodB = periodScoreB + (sideLabel === 'away' ? eventPoints : 0);
      if (regulation.completion.mode === 'sets') {
        const decided = setWinner(regulation, currentPeriod, nextPeriodA, nextPeriodB);
        const nextScoreA = scoreA + (decided === 'home' ? 1 : 0);
        const nextScoreB = scoreB + (decided === 'away' ? 1 : 0);
        const matchOver =
          nextScoreA >= regulation.completion.setsToWin ||
          nextScoreB >= regulation.completion.setsToWin;
        scoreA = nextScoreA;
        scoreB = nextScoreB;
        periodScoreA = decided && !matchOver ? 0 : nextPeriodA;
        periodScoreB = decided && !matchOver ? 0 : nextPeriodB;
        if (decided) {
          derivedPeriodResult = {
            period: currentPeriod,
            scoreA: nextPeriodA,
            scoreB: nextPeriodB,
          };
          if (!matchOver) currentPeriod += 1;
        }
      } else {
        scoreA += sideLabel === 'home' ? eventPoints : 0;
        scoreB += sideLabel === 'away' ? eventPoints : 0;
        periodScoreA = nextPeriodA;
        periodScoreB = nextPeriodB;
      }
    }
    this.assertDerivedScorePatch(patch, {
      scoreA,
      scoreB,
      periodScoreA,
      periodScoreB,
      currentPeriod,
    });
    this.assertDerivedEventScore(event, scoreA, scoreB);
    this.assertDerivedPeriodResult(payload.periodResult, derivedPeriodResult);
    const entryId =
      sideLabel === 'home' ? match.entryAId : sideLabel === 'away' ? match.entryBId : null;
    const athleteId = await this.resolveEventAthlete(
      context,
      { ...match, editionDisciplineId: match.phase.tournament.editionDisciplineId },
      event,
      sideLabel,
    );
    const nextSequence = match.lastEventSequence + 1;
    await context.transaction.matchEvent.create({
      data: {
        id: eventId,
        matchId: id,
        entryId,
        ...(athleteId ? { athleteId } : {}),
        type: mapEventType(typeLabel),
        metadata: toInputJson(
          {
            clientType: typeLabel,
            scorePoints: eventPoints,
            fairPlayPoints: secondaryRule?.fairPlayPoints ?? 0,
            declarativeResult,
          },
          'Os metadados do evento',
        ),
        detail,
        side,
        elapsedSeconds,
        ...(period !== undefined && period !== null ? { period } : {}),
        ...(periodElapsedSeconds !== undefined && periodElapsedSeconds !== null
          ? { periodElapsedSeconds }
          : {}),
        scoreA,
        scoreB,
        points: eventPoints,
        previousScore: toInputJson(
          {
            scoreA: match.scoreA,
            scoreB: match.scoreB,
            periodScoreA: match.periodScoreA,
            periodScoreB: match.periodScoreB,
            currentPeriod: match.currentPeriod,
          },
          'O placar anterior',
        ),
        sequence: nextSequence,
        occurredAt: new Date(),
      },
    });
    if (derivedPeriodResult) {
      await context.transaction.matchPeriodResult.upsert({
        where: { matchId_period: { matchId: id, period: derivedPeriodResult.period } },
        create: { matchId: id, ...derivedPeriodResult },
        update: { scoreA: derivedPeriodResult.scoreA, scoreB: derivedPeriodResult.scoreB },
      });
    }
    await context.transaction.match.update({
      where: { id },
      data: {
        scoreA,
        scoreB,
        periodScoreA,
        periodScoreB,
        currentPeriod,
        lastEventSequence: nextSequence,
      },
    });
    return this.result(match, id);
  }

  async claimOperator(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'operatorId', 'operatorName', 'force']);
    const id = actionId(payload, 'id', 'O ID da partida');
    actionString(payload, 'operatorName', 'O nome do operador', { min: 1, max: 160 });
    const force = optionalActionBoolean(payload, 'force', 'A tomada forçada da operação') ?? false;
    const operatorDeviceId = this.requireOperatorDeviceId(context);
    const requestedOperatorDeviceId = actionString(
      payload,
      'operatorId',
      'O identificador do dispositivo operador',
      { min: 1, max: 128 },
    );
    this.assertRequestedOperatorDeviceId(requestedOperatorDeviceId, operatorDeviceId);
    const match = await this.matchOrThrow(context, id);
    const staleBefore = new Date(Date.now() - OPERATOR_LOCK_MS);
    const updated = await context.transaction.match.updateMany({
      where: {
        id,
        ...(force
          ? {}
          : {
              OR: [
                { operatorId: null },
                { operatorId: context.user.id, operatorDeviceId },
                { operatorHeartbeat: null },
                { operatorHeartbeat: { lt: staleBefore } },
              ],
            }),
      },
      data: {
        operatorId: context.user.id,
        operatorDeviceId,
        operatorName: context.actorName,
        operatorHeartbeat: new Date(),
      },
    });
    if (!updated.count) {
      throw new ConflictException('A partida est\u00e1 sendo operada por outro dispositivo.');
    }
    return this.result(match, id);
  }

  async releaseOperator(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'operatorId']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const operatorDeviceId = this.requireOperatorDeviceId(context);
    const requestedOperatorDeviceId = actionString(
      payload,
      'operatorId',
      'O identificador do dispositivo operador',
      { min: 1, max: 128 },
    );
    this.assertRequestedOperatorDeviceId(requestedOperatorDeviceId, operatorDeviceId);
    const match = await this.matchOrThrow(context, id);
    this.assertOperator(match, context);
    await context.transaction.match.updateMany({
      where: { id, operatorId: context.user.id, operatorDeviceId },
      data: {
        operatorId: null,
        operatorDeviceId: null,
        operatorName: null,
        operatorHeartbeat: null,
      },
    });
    return this.result(match, id);
  }

  async undoEvent(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    _audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'eventId', 'restore']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const eventId = actionId(payload, 'eventId', 'O ID do evento');
    const restore = actionObject(payload.restore, 'O placar de restauração', [
      'scoreA',
      'scoreB',
      'periodScoreA',
      'periodScoreB',
      'currentPeriod',
    ]);
    const match = await this.matchOrThrow(context, id);
    this.assertOperator(match, context);
    const event = await context.transaction.matchEvent.findFirst({
      where: { id: eventId, matchId: id, undoneAt: null },
      select: { id: true, sequence: true, previousScore: true },
    });
    if (!event) throw new NotFoundException('Evento não encontrado ou já desfeito.');
    const latest = await context.transaction.matchEvent.findFirst({
      where: { matchId: id, undoneAt: null },
      orderBy: { sequence: 'desc' },
      select: { id: true },
    });
    if (latest?.id !== event.id) {
      throw new ConflictException('Somente o evento ativo mais recente pode ser desfeito.');
    }
    const previous = this.scoreSnapshot(event.previousScore);
    if (!previous) throw new ConflictException('O evento não possui um placar anterior válido.');
    this.assertRestoreMatchesPrevious(restore, previous);
    await context.transaction.matchEvent.update({
      where: { id: event.id },
      data: { undoneAt: new Date(), undoneById: context.user.id },
    });
    await context.transaction.matchPeriodResult.deleteMany({
      where: { matchId: id, period: { gte: previous.currentPeriod } },
    });
    await context.transaction.match.update({
      where: { id },
      data: {
        scoreA: previous.scoreA,
        scoreB: previous.scoreB,
        periodScoreA: previous.periodScoreA,
        periodScoreB: previous.periodScoreB,
        currentPeriod: previous.currentPeriod,
      },
    });
    return this.result(match, id);
  }

  async finish(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'patch']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const patch = actionObject(payload.patch, 'O encerramento da partida', FINISH_FIELDS);
    const match = await this.matchOrThrow(context, id);
    if (match.status !== MatchStatus.LIVE) {
      throw new ConflictException('Somente uma partida Ao vivo pode ser encerrada.');
    }
    this.assertOperator(match, context);
    const requestedStatus = mapMatchStatus(
      actionEnum(patch, 'status', 'O status final da partida', MATCH_STATUS_VALUES),
    );
    if (requestedStatus !== MatchStatus.FINISHED) {
      throw new ConflictException('O encerramento deve colocar a partida no status Encerrada.');
    }
    const period = actionNumber(patch, 'currentPeriod', 'A etapa final', { min: 1, max: 100 });
    const requestedScoreA = optionalActionNumber(
      patch,
      'scoreA',
      'O placar final do participante A',
      { min: 0, max: 100_000, integer: false },
    );
    const requestedScoreB = optionalActionNumber(
      patch,
      'scoreB',
      'O placar final do participante B',
      { min: 0, max: 100_000, integer: false },
    );
    if (
      period !== match.currentPeriod ||
      (requestedScoreA !== undefined && requestedScoreA !== match.scoreA) ||
      (requestedScoreB !== undefined && requestedScoreB !== match.scoreB)
    ) {
      throw new ConflictException(
        'A etapa ou o placar final diverge do estado calculado pelo servidor.',
      );
    }
    const regulation = resolveActionRegulation(
      match.phase.tournament.editionDiscipline.discipline.name,
      match.phase.tournament.editionDiscipline.config,
    );
    const configuredPeriods = regulationPeriodCount(regulation);
    if (regulation.completion.mode === 'sets') {
      if (
        match.scoreA < regulation.completion.setsToWin &&
        match.scoreB < regulation.completion.setsToWin
      ) {
        requireActionReason(audit, 'O encerramento antes da quantidade regulamentar de sets');
      }
    } else if (period < configuredPeriods) {
      requireActionReason(audit, 'O encerramento antecipado');
    }

    let tiebreak: Prisma.InputJsonValue | typeof Prisma.DbNull = Prisma.DbNull;
    let winnerEntryId: string | null = null;
    const completionAllowsDraw =
      regulation.completion.mode === 'periods' ||
      regulation.completion.mode === 'board' ||
      regulation.completion.mode === 'result'
        ? regulation.completion.allowDraw
        : false;
    const requiresTiebreak =
      match.scoreA === match.scoreB &&
      (match.phase.type === PhaseType.KNOCKOUT || !completionAllowsDraw);
    if (requiresTiebreak) {
      const rawTiebreak = actionObject(patch.tiebreak, 'O desempate', [
        'method',
        'label',
        'scoreA',
        'scoreB',
        'winner',
        'reason',
        'decidedBy',
        'at',
      ]);
      const method = actionEnum(rawTiebreak, 'method', 'O método de desempate', [
        'prorrogacao',
        'penaltis',
        'set-extra',
        'criterio-tecnico',
        'administrativo',
      ] as const);
      const label = actionString(rawTiebreak, 'label', 'A descrição do desempate', {
        min: 2,
        max: 160,
      });
      const tiebreakScoreA = actionNumber(rawTiebreak, 'scoreA', 'O placar A do desempate', {
        min: 0,
        max: 100_000,
      });
      const tiebreakScoreB = actionNumber(rawTiebreak, 'scoreB', 'O placar B do desempate', {
        min: 0,
        max: 100_000,
      });
      const winnerName = actionString(rawTiebreak, 'winner', 'O vencedor do desempate', {
        min: 1,
        max: 180,
      });
      const reason = actionString(rawTiebreak, 'reason', 'O motivo do desempate', {
        min: 5,
        max: 1_000,
      });
      winnerEntryId = await this.entryByName(
        context.transaction,
        match.phase.tournamentId,
        winnerName,
      );
      if (winnerEntryId !== match.entryAId && winnerEntryId !== match.entryBId) {
        throw new ConflictException('O vencedor do desempate deve ser um participante da partida.');
      }
      if (tiebreakScoreA === tiebreakScoreB && method !== 'administrativo') {
        throw new ConflictException(
          'Um desempate com placar empatado deve usar decisão administrativa explícita.',
        );
      }
      if (tiebreakScoreA !== tiebreakScoreB) {
        const scoreWinner = tiebreakScoreA > tiebreakScoreB ? match.entryAId : match.entryBId;
        if (winnerEntryId !== scoreWinner) {
          throw new ConflictException(
            'O vencedor informado não corresponde ao placar do desempate.',
          );
        }
      }
      tiebreak = toInputJson(
        {
          method,
          label,
          scoreA: tiebreakScoreA,
          scoreB: tiebreakScoreB,
          winner: winnerName,
          reason,
          decidedBy: context.actorName,
          at: new Date().toISOString(),
        },
        'O desempate',
      );
    } else if (match.scoreA !== match.scoreB) {
      winnerEntryId = match.scoreA > match.scoreB ? match.entryAId : match.entryBId;
    }

    const clockSeconds = optionalActionNumber(
      patch,
      'clockSeconds',
      'O tempo final do cronômetro',
      { min: 0, max: 86_400 },
    );
    await context.transaction.match.update({
      where: { id },
      data: {
        status: MatchStatus.FINISHED,
        paused: true,
        runningSince: null,
        ...(clockSeconds !== undefined && clockSeconds !== null ? { clockSeconds } : {}),
        currentPeriod: period,
        winnerEntryId,
        tiebreak,
      },
    });
    await this.recalculation.recomputeTournament(context.transaction, match.phase.tournamentId);
    return this.result(match, id);
  }

  async correctResult(
    context: EditionActionContext,
    payload: Record<string, unknown>,
    audit?: EditionActionAuditDto,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'scoreA', 'scoreB', 'correction']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const scoreA = actionNumber(payload, 'scoreA', 'O placar do participante A', {
      min: 0,
      max: 100_000,
      integer: false,
    });
    const scoreB = actionNumber(payload, 'scoreB', 'O placar do participante B', {
      min: 0,
      max: 100_000,
      integer: false,
    });
    const correction = actionObject(payload.correction, 'A retificação', [
      'id',
      'at',
      'actor',
      'reason',
      'before',
      'after',
    ]);
    const correctionId = actionId(correction, 'id', 'O ID da retificação');
    const suppliedReason = optionalActionString(correction, 'reason', 'O motivo da retificação', {
      min: 5,
      max: 1_000,
    });
    const reason = suppliedReason ?? requireActionReason(audit, 'A retificação do resultado');
    const match = await this.matchOrThrow(context, id);
    if (match.status !== MatchStatus.FINISHED && match.status !== MatchStatus.WALKOVER) {
      throw new ConflictException('Somente uma partida encerrada ou com W.O. pode ser retificada.');
    }
    if (
      await context.transaction.matchCorrection.findUnique({
        where: { id: correctionId },
        select: { id: true },
      })
    ) {
      throw new ConflictException('Já existe uma retificação com o ID informado.');
    }
    const downstream = await this.dependentMatches(context.transaction, match);
    if (downstream.some((item) => item.status !== MatchStatus.SCHEDULED)) {
      throw new ConflictException(
        'Existem partidas posteriores já operadas. Anule-as antes de retificar este resultado.',
      );
    }
    await context.transaction.match.deleteMany({
      where: { id: { in: downstream.map((item) => item.id) } },
    });
    const regulation = resolveActionRegulation(
      match.phase.tournament.editionDiscipline.discipline.name,
      match.phase.tournament.editionDiscipline.config,
    );
    const completionAllowsDraw =
      regulation.completion.mode === 'periods' ||
      regulation.completion.mode === 'board' ||
      regulation.completion.mode === 'result'
        ? regulation.completion.allowDraw
        : false;
    const tiedResultRequiresWinner =
      scoreA === scoreB && (match.phase.type === PhaseType.KNOCKOUT || !completionAllowsDraw);
    const winnerEntryId =
      scoreA === scoreB
        ? tiedResultRequiresWinner
          ? await this.persistedTiebreakWinner(context.transaction, match)
          : null
        : scoreA > scoreB
          ? match.entryAId
          : match.entryBId;
    await context.transaction.matchCorrection.create({
      data: {
        id: correctionId,
        matchId: id,
        actorId: context.user.id,
        actorName: context.actorName,
        reason,
        beforeState: toInputJson(
          { scoreA: match.scoreA, scoreB: match.scoreB },
          'O resultado anterior',
        ),
        afterState: toInputJson({ scoreA, scoreB }, 'O resultado retificado'),
      },
    });
    await context.transaction.match.update({
      where: { id },
      data: {
        scoreA,
        scoreB,
        winnerEntryId,
        walkoverWinnerEntryId: null,
        status: MatchStatus.FINISHED,
        ...(!tiedResultRequiresWinner ? { tiebreak: Prisma.DbNull } : {}),
      },
    });
    await this.recalculation.recomputeTournament(context.transaction, match.phase.tournamentId);
    return this.result(match, id);
  }

  private async dependentMatches(
    transaction: Prisma.TransactionClient,
    source: StoredMatchContext,
  ): Promise<Array<{ id: string; status: MatchStatus }>> {
    const tournamentId = source.phase.tournamentId;
    const candidates = await transaction.match.findMany({
      where: {
        phase: { tournamentId },
        id: { not: source.id, startsWith: `${tournamentId}-advanced` },
      },
      select: { id: true, status: true, round: true, bracketSlot: true },
    });
    if (source.phase.type !== PhaseType.KNOCKOUT) return candidates;
    if (source.id === `${tournamentId}-advanced-third`) return [];

    const sourcePosition = this.bracketPosition(
      source.id,
      tournamentId,
      source.round,
      source.bracketSlot,
    );
    if (!sourcePosition) return candidates;
    const normalPositions = candidates
      .map((candidate) => ({
        candidate,
        position: this.bracketPosition(
          candidate.id,
          tournamentId,
          candidate.round,
          candidate.bracketSlot,
        ),
      }))
      .filter(
        (
          item,
        ): item is {
          candidate: (typeof candidates)[number];
          position: { round: number; slot: number };
        } => item.position !== null,
      );
    const maxRound = Math.max(
      sourcePosition.round,
      ...normalPositions.map((item) => item.position.round),
    );

    return candidates.filter((candidate) => {
      if (candidate.id === `${tournamentId}-advanced-third`) {
        return sourcePosition.round < maxRound;
      }
      const position = this.bracketPosition(
        candidate.id,
        tournamentId,
        candidate.round,
        candidate.bracketSlot,
      );
      return position !== null && position.round > sourcePosition.round;
    });
  }

  private bracketPosition(
    matchId: string,
    tournamentId: string,
    storedRound: number | null,
    storedSlot: number | null,
  ): { round: number; slot: number } | null {
    if (storedRound && storedSlot) return { round: storedRound, slot: storedSlot };
    const modern = new RegExp(
      `^${tournamentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-advanced-r(\\d+)-(\\d+)$`,
    ).exec(matchId);
    if (modern) return { round: Number(modern[1]), slot: Number(modern[2]) };
    if (matchId.startsWith(`${tournamentId}-advanced-semi-`)) {
      const slot = Number(matchId.slice(`${tournamentId}-advanced-semi-`.length));
      return Number.isInteger(slot) && slot > 0 ? { round: 1, slot } : null;
    }
    if (matchId === `${tournamentId}-advanced-final`) return { round: 2, slot: 1 };
    return null;
  }

  private async persistedTiebreakWinner(
    transaction: Prisma.TransactionClient,
    match: StoredMatchContext,
  ): Promise<string> {
    const tiebreak = this.jsonRecord(match.tiebreak);
    const winnerName = typeof tiebreak?.winner === 'string' ? tiebreak.winner.trim() : '';
    if (!winnerName) {
      throw new ConflictException(
        'Uma retificação empatada nesta partida exige um desempate válido já registrado.',
      );
    }
    const method = typeof tiebreak?.method === 'string' ? tiebreak.method : '';
    const scoreA = tiebreak?.scoreA;
    const scoreB = tiebreak?.scoreB;
    if (
      typeof scoreA !== 'number' ||
      !Number.isFinite(scoreA) ||
      scoreA < 0 ||
      typeof scoreB !== 'number' ||
      !Number.isFinite(scoreB) ||
      scoreB < 0
    ) {
      throw new ConflictException('O desempate registrado não possui um placar válido.');
    }
    const winnerEntryId = await this.entryByName(transaction, match.phase.tournamentId, winnerName);
    if (winnerEntryId !== match.entryAId && winnerEntryId !== match.entryBId) {
      throw new ConflictException('O vencedor do desempate registrado não pertence à partida.');
    }
    if (scoreA === scoreB && method !== 'administrativo') {
      throw new ConflictException(
        'O desempate registrado com placar empatado não possui uma decisão administrativa válida.',
      );
    }
    if (scoreA !== scoreB) {
      const scoreWinner = scoreA > scoreB ? match.entryAId : match.entryBId;
      if (winnerEntryId !== scoreWinner) {
        throw new ConflictException(
          'O vencedor do desempate registrado não corresponde ao placar persistido.',
        );
      }
    }
    return winnerEntryId;
  }

  /**
   * Autor do lance, quando a mesa informa.
   *
   * Fica opcional de proposito. A atribuicao serve a artilharia, e artilharia
   * nao pode travar o placar: se o elenco nao estiver carregado, ou se ninguem
   * viu quem desviou, o gol precisa entrar do mesmo jeito. O que se recusa e a
   * atribuicao ERRADA -- atleta de outra equipe leva o gol para o artilheiro
   * errado, e isso e pior que gol sem autor.
   */
  /**
   * Diz quem fez o lance que acabou de ser registrado.
   *
   * Existe separado de `registerEvent` porque o placar nao pode esperar pela
   * atribuicao: no ginasio o gol entra na hora, e so depois alguem confirma o
   * autor. Um seletor bloqueando o botao de gol seria um placar errado toda
   * vez que a mesa se distraisse no meio da escolha.
   *
   * `athleteId: null` limpa a atribuicao -- serve para corrigir quem errou o
   * nome, sem precisar desfazer o gol.
   */
  async attributeEvent(
    context: EditionActionContext,
    payload: Record<string, unknown>,
  ): Promise<ActionMutationResult> {
    actionObject(payload, 'O payload', ['id', 'eventId', 'athleteId']);
    const id = actionId(payload, 'id', 'O ID da partida');
    const eventId = actionId(payload, 'eventId', 'O ID do evento');
    const match = await this.matchOrThrow(context, id);
    this.assertOperator(match, context);

    const evento = await context.transaction.matchEvent.findFirst({
      where: { id: eventId, matchId: id, undoneAt: null },
      select: { id: true, side: true },
    });
    if (!evento) throw new NotFoundException('Evento não encontrado nesta partida.');

    const sideLabel =
      evento.side === MatchEventSide.HOME
        ? ('home' as const)
        : evento.side === MatchEventSide.AWAY
          ? ('away' as const)
          : ('neutral' as const);
    const athleteId = await this.resolveEventAthlete(
      context,
      { ...match, editionDisciplineId: match.phase.tournament.editionDisciplineId },
      payload,
      sideLabel,
    );

    await context.transaction.matchEvent.update({
      where: { id: eventId },
      data: { athleteId },
    });
    return { entityType: 'MatchEvent', entityId: eventId };
  }

  private async resolveEventAthlete(
    context: EditionActionContext,
    match: { entryAId: string | null; entryBId: string | null; editionDisciplineId: string },
    event: Record<string, unknown>,
    sideLabel: 'home' | 'away' | 'neutral',
  ): Promise<string | null> {
    if (event.athleteId === undefined || event.athleteId === null) return null;
    const athleteId = actionId(event, 'athleteId', 'O ID do atleta do evento');
    if (sideLabel === 'neutral') {
      throw new ConflictException('Um evento neutro não tem autor.');
    }
    const entryId = sideLabel === 'home' ? match.entryAId : match.entryBId;
    if (!entryId) {
      throw new ConflictException('A partida ainda não tem participante definido deste lado.');
    }
    const [entry, athlete] = await Promise.all([
      context.transaction.tournamentEntry.findUnique({
        where: { id: entryId },
        select: { teamId: true, athleteId: true },
      }),
      context.transaction.athlete.findUnique({
        where: { id: athleteId },
        select: { id: true, name: true },
      }),
    ]);
    if (!athlete) throw new NotFoundException('Atleta do evento não encontrado.');
    // Modalidade individual: o participante e o proprio atleta.
    if (entry?.athleteId && entry.athleteId !== athlete.id) {
      throw new ConflictException(`${athlete.name} não é quem disputa esta partida.`);
    }
    // Coletiva: a equipe do atleta vem do elenco da modalidade nesta edicao,
    // nao do cadastro global -- e o mesmo lugar de onde a sumula tira o elenco.
    if (entry?.teamId) {
      const noElenco = await context.transaction.editionRoster.findFirst({
        where: {
          athleteId: athlete.id,
          teamId: entry.teamId,
          editionDisciplineId: match.editionDisciplineId,
          status: { not: 'WITHDRAWN' },
        },
        select: { id: true },
      });
      if (!noElenco) {
        throw new ConflictException(
          `${athlete.name} não está no elenco da equipe deste lado da partida.`,
        );
      }
    }
    return athlete.id;
  }

  private async matchOrThrow(
    context: EditionActionContext,
    id: string,
  ): Promise<StoredMatchContext> {
    const match = await context.transaction.match.findFirst({
      where: {
        id,
        phase: { tournament: { editionDiscipline: { editionId: context.edition.id } } },
      },
      select: {
        id: true,
        phaseId: true,
        round: true,
        bracketSlot: true,
        entryAId: true,
        entryBId: true,
        scoreA: true,
        scoreB: true,
        currentPeriod: true,
        clockSeconds: true,
        paused: true,
        periodScoreA: true,
        periodScoreB: true,
        runningSince: true,
        status: true,
        scheduledAt: true,
        venue: true,
        lastEventSequence: true,
        operatorId: true,
        operatorDeviceId: true,
        operatorHeartbeat: true,
        tiebreak: true,
        phase: {
          select: {
            type: true,
            tournamentId: true,
            tournament: {
              select: {
                editionDisciplineId: true,
                editionDiscipline: {
                  select: {
                    editionId: true,
                    config: true,
                    discipline: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!match) throw new NotFoundException('Partida não encontrada nesta edição.');
    return match;
  }

  private async tournamentContext(
    context: EditionActionContext,
    id: string,
  ): Promise<{ editionDisciplineId: string; disciplineName: string }> {
    const tournament = await context.transaction.tournament.findFirst({
      where: { id, editionDiscipline: { editionId: context.edition.id } },
      select: {
        editionDisciplineId: true,
        editionDiscipline: { select: { discipline: { select: { name: true } } } },
      },
    });
    if (!tournament) throw new NotFoundException('Categoria não encontrada nesta edição.');
    return {
      editionDisciplineId: tournament.editionDisciplineId,
      disciplineName: tournament.editionDiscipline.discipline.name,
    };
  }

  private async phaseContext(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    name: string,
  ): Promise<{ phaseId: string; groupId: string | null }> {
    const group = await transaction.group.findFirst({
      where: { name, phase: { tournamentId } },
      select: { id: true, phaseId: true },
    });
    if (group) return { phaseId: group.phaseId, groupId: group.id };
    const phase = await transaction.phase.findFirst({
      where: { tournamentId, OR: [{ name }, { clientId: name }] },
      select: { id: true },
    });
    if (!phase) throw new NotFoundException('A fase informada não pertence à categoria.');
    return { phaseId: phase.id, groupId: null };
  }

  private async entryByName(
    transaction: Prisma.TransactionClient,
    tournamentId: string,
    name: string,
  ): Promise<string> {
    const entries = await transaction.tournamentEntry.findMany({
      where: { tournamentId, OR: [{ team: { name } }, { athlete: { name } }] },
      take: 2,
      select: { id: true },
    });
    if (entries.length !== 1) {
      throw new NotFoundException(
        `O participante "${name}" não está inscrito de forma inequívoca.`,
      );
    }
    return entries[0].id;
  }

  private canTransition(from: MatchStatus, to: MatchStatus): boolean {
    const transitions: Record<MatchStatus, MatchStatus[]> = {
      SCHEDULED: [
        MatchStatus.SCHEDULED,
        MatchStatus.LIVE,
        MatchStatus.POSTPONED,
        MatchStatus.CANCELLED,
        MatchStatus.WALKOVER,
      ],
      LIVE: [MatchStatus.LIVE, MatchStatus.FINISHED, MatchStatus.POSTPONED, MatchStatus.WALKOVER],
      FINISHED: [MatchStatus.FINISHED],
      POSTPONED: [
        MatchStatus.POSTPONED,
        MatchStatus.SCHEDULED,
        MatchStatus.CANCELLED,
        MatchStatus.WALKOVER,
      ],
      CANCELLED: [MatchStatus.CANCELLED],
      WALKOVER: [MatchStatus.WALKOVER],
    };
    return transitions[from].includes(to);
  }

  private assertOperator(match: StoredMatchContext, context: EditionActionContext): void {
    const operatorDeviceId = this.requireOperatorDeviceId(context);
    const lockIsFresh = Boolean(
      match.operatorHeartbeat && match.operatorHeartbeat.getTime() >= Date.now() - OPERATOR_LOCK_MS,
    );
    if (
      lockIsFresh &&
      match.operatorId === context.user.id &&
      match.operatorDeviceId === operatorDeviceId
    ) {
      return;
    }
    if (!lockIsFresh || !match.operatorId || !match.operatorDeviceId) {
      throw new ConflictException(
        'A partida não possui uma trava de operador ativa. Assuma a operação antes de continuar.',
      );
    }
    throw new ConflictException('A partida est\u00e1 sendo operada por outro dispositivo.');
  }

  private requireOperatorDeviceId(context: EditionActionContext): string {
    if (!context.operatorDeviceId) {
      throw new BadRequestException(
        'O identificador do dispositivo operador \u00e9 obrigat\u00f3rio.',
      );
    }
    return context.operatorDeviceId;
  }

  private assertRequestedOperatorDeviceId(requested: string, authenticated: string): void {
    if (requested !== authenticated) {
      throw new ConflictException(
        'O dispositivo informado na opera\u00e7\u00e3o n\u00e3o corresponde ao dispositivo autenticado.',
      );
    }
  }

  private walkoverScore(config: Prisma.JsonValue | null): { winner: number; loser: number } {
    const root = this.jsonRecord(config);
    const rules = this.jsonRecord(root?.rules) ?? root;
    const walkover = this.jsonRecord(rules?.walkover);
    const winner =
      typeof walkover?.winnerScore === 'number' && Number.isInteger(walkover.winnerScore)
        ? walkover.winnerScore
        : 1;
    const loser =
      typeof walkover?.loserScore === 'number' && Number.isInteger(walkover.loserScore)
        ? walkover.loserScore
        : 0;
    return { winner, loser };
  }

  private assertDerivedScorePatch(
    patch: Record<string, unknown>,
    expected: {
      scoreA: number;
      scoreB: number;
      periodScoreA: number;
      periodScoreB: number;
      currentPeriod: number;
    },
  ): void {
    if (patch.status !== undefined) {
      const status = mapMatchStatus(
        actionEnum(patch, 'status', 'O status enviado com o evento', MATCH_STATUS_VALUES),
      );
      if (status !== MatchStatus.LIVE) {
        throw new ConflictException('Um evento não pode alterar o status da partida.');
      }
    }
    const labels = {
      scoreA: 'O placar do participante A',
      scoreB: 'O placar do participante B',
      periodScoreA: 'O placar da etapa do participante A',
      periodScoreB: 'O placar da etapa do participante B',
      currentPeriod: 'A etapa atual',
    } as const;
    for (const field of Object.keys(labels) as Array<keyof typeof labels>) {
      if (patch[field] === undefined) continue;
      const value = actionNumber(patch, field, labels[field], {
        min: field === 'currentPeriod' ? 1 : 0,
        max: field === 'currentPeriod' ? 100 : 100_000,
        integer: field !== 'scoreA' && field !== 'scoreB',
      });
      if (value !== expected[field]) {
        throw new ConflictException(
          `${labels[field]} diverge do valor calculado pelo regulamento.`,
        );
      }
    }
  }

  private declarativeScore(
    regulation: ActionRegulation,
    side: 'home' | 'away' | 'neutral',
  ): { scoreA: number; scoreB: number } {
    const completion = regulation.completion;
    if (completion.mode !== 'board' && completion.mode !== 'result') {
      throw new ConflictException('A modalidade não aceita declaração absoluta de resultado.');
    }
    if (side === 'neutral') {
      if (!completion.allowDraw) {
        throw new ConflictException('O regulamento desta modalidade não permite empate.');
      }
      const drawPoints = completion.mode === 'board' ? completion.drawPoints : 0;
      return { scoreA: drawPoints, scoreB: drawPoints };
    }
    const winPoints = completion.mode === 'board' ? completion.winPoints : 1;
    return side === 'home' ? { scoreA: winPoints, scoreB: 0 } : { scoreA: 0, scoreB: winPoints };
  }

  private assertDerivedEventScore(
    event: Record<string, unknown>,
    scoreA: number,
    scoreB: number,
  ): void {
    const sentScoreA = optionalActionNumber(event, 'scoreA', 'O placar A do evento', {
      min: 0,
      max: 100_000,
      integer: false,
    });
    const sentScoreB = optionalActionNumber(event, 'scoreB', 'O placar B do evento', {
      min: 0,
      max: 100_000,
      integer: false,
    });
    if (
      (sentScoreA !== undefined && sentScoreA !== scoreA) ||
      (sentScoreB !== undefined && sentScoreB !== scoreB)
    ) {
      throw new ConflictException('O placar do evento diverge do valor calculado pelo servidor.');
    }
  }

  private assertDerivedPeriodResult(
    value: unknown,
    expected: { period: number; scoreA: number; scoreB: number } | undefined,
  ): void {
    if (value === undefined) return;
    const result = actionObject(value, 'O resultado da etapa', ['period', 'scoreA', 'scoreB']);
    const received = {
      period: actionNumber(result, 'period', 'A etapa concluída', { min: 1, max: 100 }),
      scoreA: actionNumber(result, 'scoreA', 'O placar final da etapa do participante A', {
        min: 0,
        max: 100_000,
      }),
      scoreB: actionNumber(result, 'scoreB', 'O placar final da etapa do participante B', {
        min: 0,
        max: 100_000,
      }),
    };
    if (
      !expected ||
      received.period !== expected.period ||
      received.scoreA !== expected.scoreA ||
      received.scoreB !== expected.scoreB
    ) {
      throw new ConflictException(
        'O resultado da etapa diverge do valor calculado pelo regulamento.',
      );
    }
  }

  private async assertClockPeriodResults(
    transaction: Prisma.TransactionClient,
    matchId: string,
    value: unknown,
    appended: { period: number; scoreA: number; scoreB: number } | undefined,
  ): Promise<void> {
    if (value === undefined) return;
    const received = actionArray(value, 'Os resultados das etapas', 100).map((item, index) => {
      const result = actionObject(item, `O resultado da etapa ${index + 1}`, [
        'period',
        'scoreA',
        'scoreB',
      ]);
      return {
        period: actionNumber(result, 'period', `A etapa ${index + 1}`, { min: 1, max: 100 }),
        scoreA: actionNumber(result, 'scoreA', `O placar A da etapa ${index + 1}`, {
          min: 0,
          max: 100_000,
        }),
        scoreB: actionNumber(result, 'scoreB', `O placar B da etapa ${index + 1}`, {
          min: 0,
          max: 100_000,
        }),
      };
    });
    const stored = await transaction.matchPeriodResult.findMany({
      where: { matchId },
      orderBy: [{ period: 'asc' }, { id: 'asc' }],
      select: { period: true, scoreA: true, scoreB: true },
    });
    const expected = appended
      ? [...stored.filter((item) => item.period !== appended.period), appended].sort(
          (left, right) => left.period - right.period,
        )
      : stored;
    if (
      received.length !== expected.length ||
      received.some(
        (item, index) =>
          item.period !== expected[index]?.period ||
          item.scoreA !== expected[index]?.scoreA ||
          item.scoreB !== expected[index]?.scoreB,
      )
    ) {
      throw new ConflictException(
        'Os resultados das etapas divergem do histórico calculado pelo servidor.',
      );
    }
  }

  private scoreSnapshot(value: Prisma.JsonValue | null): {
    scoreA: number;
    scoreB: number;
    periodScoreA: number;
    periodScoreB: number;
    currentPeriod: number;
  } | null {
    const record = this.jsonRecord(value);
    if (!record) return null;
    const fields = ['scoreA', 'scoreB', 'periodScoreA', 'periodScoreB', 'currentPeriod'] as const;
    if (fields.some((field) => typeof record[field] !== 'number')) return null;
    return {
      scoreA: record.scoreA as number,
      scoreB: record.scoreB as number,
      periodScoreA: record.periodScoreA as number,
      periodScoreB: record.periodScoreB as number,
      currentPeriod: record.currentPeriod as number,
    };
  }

  private assertRestoreMatchesPrevious(
    restore: Record<string, unknown>,
    previous: {
      scoreA: number;
      scoreB: number;
      periodScoreA: number;
      periodScoreB: number;
      currentPeriod: number;
    },
  ): void {
    const labels = {
      scoreA: 'O placar do participante A',
      scoreB: 'O placar do participante B',
      periodScoreA: 'O placar parcial do participante A',
      periodScoreB: 'O placar parcial do participante B',
      currentPeriod: 'A etapa atual',
    } as const;
    for (const field of Object.keys(labels) as Array<keyof typeof labels>) {
      const value = actionNumber(restore, field, labels[field], {
        min: field === 'currentPeriod' ? 1 : 0,
        max: field === 'currentPeriod' ? 100 : 100_000,
        integer: field !== 'scoreA' && field !== 'scoreB',
      });
      if (value !== previous[field]) {
        throw new ConflictException(
          'O placar de restauração diverge do histórico persistido do evento.',
        );
      }
    }
  }

  /**
   * Início do cronômetro carimbado pelo aparelho que opera, com limite.
   *
   * Aceitar o carimbo do cliente é o que mantém o decorrido na mesma base de
   * tempo do `Date.now()` que o conta. Mas aceitar sem limite deixaria um
   * aparelho com a data completamente errada gravar um início no ano passado —
   * e aí o relógio nasceria com horas de jogo. Fora da janela, vale o do
   * servidor: perde-se a precisão do desvio, e não a sanidade do dado.
   */
  private acceptClientClockStart(patch: Record<string, unknown>, serverNow: Date): Date {
    const informed = optionalActionString(patch, 'runningSince', 'O início do cronômetro', {
      min: 10,
      max: 80,
    });
    if (!informed) return serverNow;
    const parsed = new Date(informed);
    if (Number.isNaN(parsed.getTime())) return serverNow;
    return Math.abs(parsed.getTime() - serverNow.getTime()) <= MAX_CLIENT_CLOCK_SKEW_MS
      ? parsed
      : serverNow;
  }

  private jsonRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private result(match: StoredMatchContext, id: string): ActionMutationResult {
    return {
      entityType: 'Match',
      entityId: id,
      editionDisciplineId: match.phase.tournament.editionDisciplineId,
    };
  }
}
