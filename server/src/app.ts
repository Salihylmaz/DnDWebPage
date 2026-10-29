import 'express-async-errors';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './lib/env';
import prisma from './lib/prisma';
import { verifyToken, COOKIE_NAME } from './lib/jwt';

// Import routers
import authRouter from './routes/auth';
import sessionsRouter from './routes/sessions';
import itemsRouter from './routes/items';
import charactersRouter from './routes/characters';
import traitsRouter from './routes/traits';
import skillsRouter from './routes/skills';
import creaturesRouter from './routes/creatures';
import combatRouter from './routes/combat';
import logbookRouter from './routes/logbook';

export function createApp() {
  const app = express();
  // The app is reachable only through Caddy and Nginx in production.
  app.set('trust proxy', 2);

  // ── Middleware ────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true, // required for httpOnly cookie auth
    })
  );
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ── Routers ───────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', sessionsRouter);   // Step 3 ✓
  app.use('/api/sessions', itemsRouter);       // Step 4 ✓
  app.use('/api/sessions', charactersRouter);  // Step 5 ✓
  app.use('/api/sessions', traitsRouter);      // Step 7 ✓
  app.use('/api/sessions', skillsRouter);
  app.use('/api/sessions', creaturesRouter);
  app.use('/api/sessions', combatRouter);
  app.use('/api/sessions', logbookRouter);

  // Do not leak database errors, stack traces, or request data to API clients.
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : 500;
    console.error('[API] Request failed:', error);
    if (status === 400) {
      res.status(400).json({ error: 'İstek biçimi geçersiz' });
      return;
    }
    if (status === 413) {
      res.status(413).json({ error: 'İstek boyutu çok büyük' });
      return;
    }
    res.status(500).json({ error: 'Sunucu hatası' });
  });

  return app;
}

export function createSocketServer(httpServer: ReturnType<typeof createServer>, clientOrigin: string) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
    allowRequest: (request, callback) => {
      callback(null, request.headers.origin === clientOrigin);
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie ?? '';
      const authCookie = cookieHeader.split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${COOKIE_NAME}=`));
      const token = authCookie?.slice(COOKIE_NAME.length + 1);
      if (!token) {
        next(new Error('unauthorized'));
        return;
      }

      const payload = verifyToken(decodeURIComponent(token));
      const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
      if (!user) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Client joins a session room to receive realtime updates
    socket.on('join-session', async (sessionId: unknown) => {
      if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
        return;
      }
      try {
        const member = await prisma.sessionMember.findUnique({
          where: { sessionId_userId: { sessionId, userId: socket.data.userId as string } },
          select: { sessionId: true },
        });
        if (!member) {
          socket.emit('session:join-denied');
          return;
        }
        socket.join(`session:${sessionId}`);
        console.log(`[Socket.IO] ${socket.id} joined session:${sessionId}`);
      } catch {
        socket.emit('session:join-denied');
      }
    });

    socket.on('leave-session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

// ── Event name constants (shared between server routes and client hooks) ──────
export const SOCKET_EVENTS = {
  ITEM_CREATED: 'item:created',
  ITEM_UPDATED: 'item:updated',
  ITEM_DELETED: 'item:deleted',
  STAT_UPDATED: 'stat:updated',
  TRAIT_CREATED: 'trait:created',
  TRAIT_UPDATED: 'trait:updated',
  TRAIT_DELETED: 'trait:deleted',
  CHARACTER_CREATED: 'character:created',
  CHARACTER_DELETED: 'character:deleted',
} as const;
