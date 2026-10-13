/**
 * testHelpers.ts
 * Shared utilities for integration tests:
 *   - createTestUser  — creates a user in DB and returns JWT cookie
 *   - createTestSession — creates a session with the given DM user
 *   - cleanupUsers / cleanupSessions — delete test data
 *
 * Tests use real DB (dev database) but clean up after themselves.
 * This is acceptable for a small portfolio project; for larger projects
 * a dedicated test DB with migrations would be better.
 */

import request from 'supertest';
import { createApp } from '../../app';
import prisma from '../../lib/prisma';

const app = createApp();

// ── User helpers ──────────────────────────────────────────────────────────────
export async function registerAndLogin(opts: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ cookie: string; userId: string }> {
  // Register
  await request(app)
    .post('/api/auth/register')
    .send(opts)
    .expect(201);

  // Login and grab cookie
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: opts.email, password: opts.password })
    .expect(200);

  const cookie = res.headers['set-cookie']?.[0] ?? '';
  const user = await prisma.user.findUnique({ where: { email: opts.email } });

  return { cookie, userId: user!.id };
}

// ── Session helpers ───────────────────────────────────────────────────────────
export async function createSession(
  cookie: string,
  name = 'Test Session'
): Promise<{ sessionId: string; inviteCode: string }> {
  const res = await request(app)
    .post('/api/sessions')
    .set('Cookie', cookie)
    .send({ name })
    .expect(201);

  return {
    sessionId: res.body.data.id as string,
    inviteCode: res.body.data.inviteCode as string,
  };
}

export async function joinSession(cookie: string, inviteCode: string) {
  return request(app)
    .post('/api/sessions/join')
    .set('Cookie', cookie)
    .send({ inviteCode });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
export async function cleanup(emails: string[]) {
  // Cascade deletes handle sessions, members, items, characters automatically
  await prisma.user.deleteMany({
    where: { email: { in: emails } },
  });
}

export { app, prisma };
