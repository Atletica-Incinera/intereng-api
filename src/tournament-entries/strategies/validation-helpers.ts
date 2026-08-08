import { NotFoundException, ConflictException } from '@nestjs/common';

export async function validateEntityExists<T>(
  findUniqueFn: () => Promise<T | null>,
  notFoundMessage: string,
): Promise<T> {
  const entity = await findUniqueFn();
  if (!entity) {
    throw new NotFoundException(notFoundMessage);
  }
  return entity;
}

export async function validateEntityUniqueness<T>(
  findUniqueFn: () => Promise<T | null>,
  conflictMessage: string,
): Promise<void> {
  const existing = await findUniqueFn();
  if (existing) {
    throw new ConflictException(conflictMessage);
  }
}
