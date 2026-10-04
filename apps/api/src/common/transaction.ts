import { Prisma } from '../generated/prisma/client';
import { setTimeout as delay } from 'node:timers/promises';
import type { PrismaService } from '../database/prisma.service';
import { ApiError } from './api-error';

function retryableTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; cause?: unknown };
  // PrismaPg can expose a commit failure directly rather than wrapping it as P2034.
  // Match the adapter's structured database error, never its SQL/error message.
  if (candidate.name !== 'DriverAdapterError' || !candidate.cause || typeof candidate.cause !== 'object') return false;
  const cause = candidate.cause as { kind?: unknown; originalCode?: unknown };
  return cause.kind === 'TransactionWriteConflict' && (cause.originalCode === '40001' || cause.originalCode === '40P01');
}

export async function serializable<T>(prisma: PrismaService, operation: (transaction: Prisma.TransactionClient) => Promise<T>, options: { timeout?: number } = {}): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...(options.timeout ? { timeout: options.timeout } : {}) });
    } catch (error) {
      if (!retryableTransactionConflict(error)) throw error;
      if (attempt === 2) throw new ApiError(409, 'CONCURRENT_CHANGE', 'Another change happened at the same time. Refresh and try again.');
      // Give the winning transaction time to commit before opening a fresh snapshot.
      // Waiting occurs after rollback, so no application transaction holds locks.
      await delay(20 * 2 ** attempt);
    }
  }
  throw new Error('Transaction retry exhausted.');
}

export function translateDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ApiError(409, 'DUPLICATE_VALUE', 'This value is already in use. Choose a different value.');
    if (error.code === 'P2003') throw new ApiError(409, 'REFERENCE_CONFLICT', 'This change conflicts with a related record. Refresh and check its relationships.');
    if (error.code === 'P2025') throw new ApiError(404, 'NOT_FOUND', 'This record no longer exists. Refresh the list.');
  }
  throw error;
}
