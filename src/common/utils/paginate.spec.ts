import { paginate } from './paginate';
import { Competition } from '@prisma/client';

describe('paginate', () => {
  it('should calculate totalPages correctly for Competition model', async () => {
    const mockCompetitionModel = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: '1',
          name: 'Intereng 2026',
          slug: 'intereng-2026',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      count: jest.fn().mockResolvedValue(1),
    };

    const result = await paginate<Competition>(mockCompetitionModel, {
      page: 1,
      pageSize: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(mockCompetitionModel.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 10,
    });
    expect(mockCompetitionModel.count).toHaveBeenCalledWith({});
  });

  it('should return totalPages = 0 when total is 0', async () => {
    const mockCompetitionModel = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    const result = await paginate<Competition>(mockCompetitionModel, {
      page: 1,
      pageSize: 20,
    });

    expect(result.items).toHaveLength(0);
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it('should calculate totalPages correctly with pagination options', async () => {
    const mockCompetitionModel = {
      findMany: jest.fn().mockResolvedValue(Array(5).fill({ id: 'x' })),
      count: jest.fn().mockResolvedValue(25),
    };

    const result = await paginate<Competition>(mockCompetitionModel, {
      page: 2,
      pageSize: 10,
    });

    expect(result.meta).toEqual({
      page: 2,
      pageSize: 10,
      total: 25,
      totalPages: 3,
    });
    expect(mockCompetitionModel.findMany).toHaveBeenCalledWith({
      skip: 10,
      take: 10,
    });
  });

  it('should respect where, orderBy, include, select arguments', async () => {
    const mockCompetitionModel = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };

    const where = { name: { contains: 'Inter' } };
    const orderBy = { createdAt: 'desc' };
    const include = { editions: true };

    await paginate<Competition>(mockCompetitionModel, {
      page: 1,
      pageSize: 10,
      where,
      orderBy,
      include,
    });

    expect(mockCompetitionModel.findMany).toHaveBeenCalledWith({
      skip: 0,
      take: 10,
      where,
      orderBy,
      include,
    });
    expect(mockCompetitionModel.count).toHaveBeenCalledWith({
      where,
    });
  });
});
