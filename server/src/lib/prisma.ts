import { PrismaClient } from '@prisma/client';

// Single shared Prisma client instance for the whole app.
// Using a module-level singleton avoids creating multiple DB connection pools.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

export default prisma;
