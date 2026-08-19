import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../common/prisma/prisma.service';
import { StandingsService } from './standings.service';
import { MatchStatus, TournamentFormat, PhaseType, EditionStatus } from '@prisma/client';

async function cleanDatabase(prisma: PrismaService) {
  await prisma.phaseStanding.deleteMany({});
  await prisma.match.deleteMany({});
  await prisma.groupEntry.deleteMany({});
  await prisma.group.deleteMany({});
  await prisma.phase.deleteMany({});
  await prisma.tournamentEntry.deleteMany({});
  await prisma.tournament.deleteMany({});
  await prisma.editionDiscipline.deleteMany({});
  await prisma.discipline.deleteMany({});
  await prisma.competitionEdition.deleteMany({});
  await prisma.competition.deleteMany({});
  await prisma.team.deleteMany({});
}

describe('StandingsService', () => {
  let prisma: PrismaService;
  let service: StandingsService;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/competitions?schema=public';

    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, StandingsService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<StandingsService>(StandingsService);

    await prisma.$connect();
  });

  afterAll(async () => {
    await cleanDatabase(prisma);
    await prisma.$disconnect();
  });

  describe('Standings Calculation Integration', () => {
    let competitionId: string;
    let editionId: string;
    let disciplineId: string;
    let editionDisciplineId: string;
    let tournamentId: string;
    let phaseId: string;
    let groupId: string;

    let teamAId: string;
    let teamBId: string;
    let teamCId: string;
    let teamDId: string;

    let entryAId: string;
    let entryBId: string;
    let entryCId: string;
    let entryDId: string;

    beforeEach(async () => {
      await cleanDatabase(prisma);

      // Create core structure
      const comp = await prisma.competition.create({
        data: { name: 'Intereng', slug: 'intereng' },
      });
      competitionId = comp.id;

      const edit = await prisma.competitionEdition.create({
        data: {
          competitionId,
          year: 2026,
          name: 'Intereng 2026',
          startDate: new Date('2026-10-12T00:00:00Z'),
          endDate: new Date('2026-10-19T00:00:00Z'),
          status: EditionStatus.ONGOING,
        },
      });
      editionId = edit.id;

      const disc = await prisma.discipline.create({
        data: { name: 'Futsal', slug: 'futsal' },
      });
      disciplineId = disc.id;

      const edDisc = await prisma.editionDiscipline.create({
        data: { editionId, disciplineId },
      });
      editionDisciplineId = edDisc.id;

      const tourn = await prisma.tournament.create({
        data: {
          editionDisciplineId,
          name: 'Futsal Masculino',
          format: TournamentFormat.GROUP_KNOCKOUT,
        },
      });
      tournamentId = tourn.id;

      // Create teams
      const teamA = await prisma.team.create({ data: { name: 'CIn FC', slug: 'cin' } });
      const teamB = await prisma.team.create({ data: { name: 'CTG United', slug: 'ctg' } });
      const teamC = await prisma.team.create({ data: { name: 'Medicina', slug: 'med' } });
      const teamD = await prisma.team.create({ data: { name: 'Direito', slug: 'dir' } });
      teamAId = teamA.id;
      teamBId = teamB.id;
      teamCId = teamC.id;
      teamDId = teamD.id;

      // Create tournament entries
      const entryA = await prisma.tournamentEntry.create({
        data: { tournamentId, teamId: teamAId },
      });
      const entryB = await prisma.tournamentEntry.create({
        data: { tournamentId, teamId: teamBId },
      });
      const entryC = await prisma.tournamentEntry.create({
        data: { tournamentId, teamId: teamCId },
      });
      const entryD = await prisma.tournamentEntry.create({
        data: { tournamentId, teamId: teamDId },
      });
      entryAId = entryA.id;
      entryBId = entryB.id;
      entryCId = entryC.id;
      entryDId = entryD.id;

      // Create phase with tiebreakers config: points -> headToHead -> goalDiff
      const phase = await prisma.phase.create({
        data: {
          tournamentId,
          clientId: 'standings-phase-1',
          order: 1,
          name: 'Fase de Grupos',
          type: PhaseType.GROUP,
          config: {
            advanceCount: 2,
            tiebreakers: ['points', 'headToHead', 'goalDiff'],
          },
        },
      });
      phaseId = phase.id;

      // Create group and assign entries
      const grp = await prisma.group.create({
        data: { phaseId, name: 'Grupo A' },
      });
      groupId = grp.id;

      await prisma.groupEntry.createMany({
        data: [
          { groupId, entryId: entryAId },
          { groupId, entryId: entryBId },
          { groupId, entryId: entryCId },
          { groupId, entryId: entryDId },
        ],
      });
    });

    it('should throw NotFoundException if retrieving standings for non-existent phase', async () => {
      await expect(service.getStandings('invalid-phase-id')).rejects.toThrow(
        'Fase com ID "invalid-phase-id" não encontrada.',
      );
    });

    it('should correctly calculate standings with basic matches (win, loss, draw)', async () => {
      // Game 1: A vs B -> A wins 3-1
      await prisma.match.create({
        data: {
          phaseId,
          groupId,
          entryAId: entryAId,
          entryBId: entryBId,
          scoreA: 3,
          scoreB: 1,
          winnerEntryId: entryAId,
          status: MatchStatus.FINISHED,
        },
      });

      // Game 2: C vs D -> Draw 2-2
      await prisma.match.create({
        data: {
          phaseId,
          groupId,
          entryAId: entryCId,
          entryBId: entryDId,
          scoreA: 2,
          scoreB: 2,
          winnerEntryId: null,
          status: MatchStatus.FINISHED,
        },
      });

      await service.recomputeStandings(phaseId);

      const standings = await service.getStandings(phaseId);

      expect(standings).toHaveLength(4);

      // A: 1 played, 1 won, 0 drawn, 0 lost, 3 scoreFor, 1 scoreAgainst, 3 points, rank 1
      const stdA = standings.find((s) => s.entryId === entryAId)!;
      expect(stdA.played).toBe(1);
      expect(stdA.won).toBe(1);
      expect(stdA.lost).toBe(0);
      expect(stdA.points).toBe(3);
      expect(stdA.scoreFor).toBe(3);
      expect(stdA.scoreAgainst).toBe(1);
      expect(stdA.rank).toBe(1);

      // C or D: 1 played, 0 won, 1 drawn, 0 lost, 2 scoreFor, 2 scoreAgainst, 1 points
      const stdC = standings.find((s) => s.entryId === entryCId)!;
      expect(stdC.played).toBe(1);
      expect(stdC.drawn).toBe(1);
      expect(stdC.points).toBe(1);

      const stdD = standings.find((s) => s.entryId === entryDId)!;
      expect(stdD.played).toBe(1);
      expect(stdD.drawn).toBe(1);
      expect(stdD.points).toBe(1);

      // B: 1 played, 0 won, 0 drawn, 1 lost, 1 scoreFor, 3 scoreAgainst, 0 points
      const stdB = standings.find((s) => s.entryId === entryBId)!;
      expect(stdB.played).toBe(1);
      expect(stdB.lost).toBe(1);
      expect(stdB.points).toBe(0);
    });

    it('should handle complex three-way tie breaking using head-to-head first, and goalDiff second', async () => {
      // Scenario: A, B, C all end up with 6 points. D has 0 points.
      // Matches:
      // A 2 vs 0 B (A wins)
      // B 1 vs 0 C (B wins)
      // C 2 vs 1 A (C wins)
      // A 3 vs 0 D (A wins)
      // B 3 vs 0 D (B wins)
      // C 3 vs 0 D (C wins)
      //
      // Overall stats:
      // A: played=3, won=2, lost=1, scoreFor=6, scoreAgainst=2, points=6. goalDiff = +4
      // B: played=3, won=2, lost=1, scoreFor=4, scoreAgainst=2, points=6. goalDiff = +2
      // C: played=3, won=2, lost=1, scoreFor=5, scoreAgainst=2, points=6. goalDiff = +3
      // D: played=3, won=0, lost=3, scoreFor=0, scoreAgainst=9, points=0. goalDiff = -9
      //
      // Points H2H mini-table {A, B, C}:
      // A: vs B (+3), vs C (0) -> 3 points
      // B: vs A (0), vs C (+3) -> 3 points
      // C: vs A (+3), vs B (0) -> 3 points
      // Since H2H points are tied (3 each), H2H doesn't resolve it.
      // We fall back to overall goalDiff:
      // A: +4 -> Rank 1
      // C: +3 -> Rank 2
      // B: +2 -> Rank 3
      // D: -9 -> Rank 4

      await prisma.match.createMany({
        data: [
          {
            phaseId,
            groupId,
            entryAId: entryAId,
            entryBId: entryBId,
            scoreA: 2,
            scoreB: 0,
            winnerEntryId: entryAId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryBId,
            entryBId: entryCId,
            scoreA: 1,
            scoreB: 0,
            winnerEntryId: entryBId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryCId,
            entryBId: entryAId,
            scoreA: 2,
            scoreB: 1,
            winnerEntryId: entryCId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryAId,
            entryBId: entryDId,
            scoreA: 3,
            scoreB: 0,
            winnerEntryId: entryAId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryBId,
            entryBId: entryDId,
            scoreA: 3,
            scoreB: 0,
            winnerEntryId: entryBId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryCId,
            entryBId: entryDId,
            scoreA: 3,
            scoreB: 0,
            winnerEntryId: entryCId,
            status: MatchStatus.FINISHED,
          },
        ],
      });

      await service.recomputeStandings(phaseId);

      const standings = await service.getStandings(phaseId);

      expect(standings).toHaveLength(4);

      // Check ranks according to logic
      expect(standings[0].entryId).toBe(entryAId);
      expect(standings[0].rank).toBe(1);

      expect(standings[1].entryId).toBe(entryCId);
      expect(standings[1].rank).toBe(2);

      expect(standings[2].entryId).toBe(entryBId);
      expect(standings[2].rank).toBe(3);

      expect(standings[3].entryId).toBe(entryDId);
      expect(standings[3].rank).toBe(4);
    });

    it('should resolve a direct head-to-head tie between two teams', async () => {
      // Matches:
      // A 1 vs 0 B (A wins)
      // A 0 vs 2 C (C wins)
      // B 3 vs 0 C (B wins)
      //
      // Standings:
      // A: played=2, won=1, lost=1, scoreFor=1, scoreAgainst=2, points=3.
      // B: played=2, won=1, lost=1, scoreFor=3, scoreAgainst=1, points=3.
      // C: played=2, won=1, lost=1, scoreFor=2, scoreAgainst=3, points=3.
      // Everybody has 3 points.
      // H2H points mini-table:
      // A: vs B (3), vs C (0) -> 3 pts
      // B: vs A (0), vs C (3) -> 3 pts
      // C: vs A (3), vs B (0) -> 3 pts
      // H2H points are tied.
      // Overall goalDiff:
      // B: +2 -> Rank 1
      // C: -1 -> Rank 2 (since C vs A (C won) -> H2H between C and A resolves it?
      // Wait, let's look: C and A are tied in points and goalDiff is:
      // A: -1
      // C: -1
      // Since C and A have the same points (3) and goalDiff (-1), they are evaluated by H2H.
      // Since C won against A, C should be ranked above A!
      // This is a great test!

      await prisma.match.createMany({
        data: [
          {
            phaseId,
            groupId,
            entryAId: entryAId,
            entryBId: entryBId,
            scoreA: 1,
            scoreB: 0,
            winnerEntryId: entryAId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryCId,
            entryBId: entryAId,
            scoreA: 2,
            scoreB: 0,
            winnerEntryId: entryCId,
            status: MatchStatus.FINISHED,
          },
          {
            phaseId,
            groupId,
            entryAId: entryBId,
            entryBId: entryCId,
            scoreA: 3,
            scoreB: 0,
            winnerEntryId: entryBId,
            status: MatchStatus.FINISHED,
          },
        ],
      });

      await service.recomputeStandings(phaseId);

      const standings = await service.getStandings(phaseId);

      expect(standings).toHaveLength(4);

      // Rank 1: B (3 pts, +2 goalDiff)
      expect(standings[0].entryId).toBe(entryBId);
      expect(standings[0].rank).toBe(1);

      // C and A: both 3 pts, -1 goalDiff.
      // H2H between C and A: C won 2-0. So C should be Rank 2, A should be Rank 3.
      expect(standings[1].entryId).toBe(entryCId);
      expect(standings[1].rank).toBe(2);

      expect(standings[2].entryId).toBe(entryAId);
      expect(standings[2].rank).toBe(3);
    });

    it('should assign equal ranks if teams are absolutely tied on all criteria', async () => {
      // Scenario: A and B are totally tied on everything.
      // Game: A vs B -> Draw 1-1
      await prisma.match.create({
        data: {
          phaseId,
          groupId,
          entryAId: entryAId,
          entryBId: entryBId,
          scoreA: 1,
          scoreB: 1,
          winnerEntryId: null,
          status: MatchStatus.FINISHED,
        },
      });

      await service.recomputeStandings(phaseId);

      const standings = await service.getStandings(phaseId);

      // C and D have 0 played. A and B have 1 played, 1 points.
      // A and B should share Rank 1.
      const stdA = standings.find((s) => s.entryId === entryAId)!;
      const stdB = standings.find((s) => s.entryId === entryBId)!;

      expect(stdA.rank).toBe(1);
      expect(stdB.rank).toBe(1);
    });
  });
});
