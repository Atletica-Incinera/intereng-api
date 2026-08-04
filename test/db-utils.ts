import { PrismaClient } from '@prisma/client';

/**
 * Truncates all public tables in the database dynamically (excluding _prisma_migrations),
 * using CASCADE to handle foreign key dependencies.
 *
 * @param prisma The PrismaClient instance to execute queries against.
 */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const tables: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table.tablename}" CASCADE;`);
  }
}
