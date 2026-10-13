import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './lib/env';

// Import routers
import authRouter from './routes/auth';
import sessionsRouter from './routes/sessions';
import itemsRouter from './routes/items';
import charactersRouter from './routes/characters';
import traitsRouter from './routes/traits';

export function createApp() {
  const app = express();

  // ── Middleware ────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true, // required for httpOnly cookie auth
    })
  );
  app.use(express.json());
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

  return app;
}

export function createSocketServer(httpServer: ReturnType<typeof createServer>, clientOrigin: string) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: clientOrigin,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Client joins a session room to receive realtime updates
    socket.on('join-session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      console.log(`[Socket.IO] ${socket.id} joined session:${sessionId}`);
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
