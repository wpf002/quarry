export * from '@prisma/client';
import { PrismaClient } from '@prisma/client';

// Reuse one client across Next.js / tsx HMR reloads in dev. Without this, each
// hot reload constructs a new PrismaClient with its own pool and leaks
// connections until Postgres runs out of slots.
const g = globalThis as unknown as { __quarryPrisma?: PrismaClient };
export const prisma = g.__quarryPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.__quarryPrisma = prisma;
