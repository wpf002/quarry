import { prisma } from '@quarry/db';

export { prisma };

/**
 * Run a DB query, returning `fallback` if the database is unreachable. Lets the
 * UI render an empty state during local dev before Postgres is provisioned.
 */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
