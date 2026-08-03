/**
 * Interface representing custom pagination options.
 * Supports standard page controls and generic Prisma query options
 * (e.g. where, orderBy, include, select, distinct, relationLoadStrategy)
 * keeping the utility compliant with the Open/Closed Principle (OCP).
 */
export interface PaginateOptions {
  /**
   * The page number to retrieve. Defaults to 1.
   */
  page?: number;

  /**
   * The number of items to retrieve per page. Defaults to 20. Max 100.
   */
  pageSize?: number;

  /**
   * Additional database query options (where, orderBy, include, select, etc.)
   */
  [key: string]: unknown;
}

/**
 * Interface representing the paginated list results.
 */
export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Paginates a Prisma model query executing `findMany` and `count` in parallel.
 * Follows DRY and OCP principles by forwarding generic query arguments automatically.
 *
 * @param model A Prisma Client model instance supporting findMany and count queries.
 * @param options Pagination controls and extra search parameters.
 * @returns A promise resolving to the paginated result containing items and metadata.
 */
export async function paginate<T>(
  model: {
    findMany(args?: any): Promise<T[]>;
    count(args?: any): Promise<number>;
  },
  options: PaginateOptions = {},
): Promise<PaginatedResult<T>> {
  const page = options.page !== undefined ? Math.max(1, options.page) : 1;
  const pageSize =
    options.pageSize !== undefined
      ? Math.max(1, Math.min(100, options.pageSize))
      : 20;

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // Extract query options excluding the pagination controls
  const prismaQueryOptions: Record<string, unknown> = {};
  for (const key of Object.keys(options)) {
    if (key !== 'page' && key !== 'pageSize') {
      prismaQueryOptions[key] = options[key];
    }
  }

  const findManyArgs: Record<string, unknown> = {
    skip,
    take,
    ...prismaQueryOptions,
  };

  const countArgs = prismaQueryOptions.where
    ? { where: prismaQueryOptions.where }
    : {};

  const [items, total] = await Promise.all([
    model.findMany(findManyArgs),
    model.count(countArgs),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return {
    items,
    meta: {
      page,
      pageSize,
      total,
      totalPages,
    },
  };
}
