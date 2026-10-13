import 'dotenv/config'; // must be first — loads .env before anything else
import { createServer } from 'http';
import { createApp, createSocketServer } from './app';
import { env } from './lib/env';
import prisma from './lib/prisma';

async function main() {
  // Verify DB connection before accepting traffic
  await prisma.$connect();
  console.log('[DB] Connected to PostgreSQL via Prisma');

  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer, env.CLIENT_ORIGIN);

  // Make `io` accessible in route handlers via app.locals
  app.locals.io = io;

  httpServer.listen(env.PORT, () => {
    console.log(`[Server] Listening on http://localhost:${env.PORT}`);
    console.log(`[Server] Health: http://localhost:${env.PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[Server] Fatal error:', err);
  process.exit(1);
});
