/**
 * testHelpers.ts
 * Shared utilities for integration tests:
 *   - registerAndLogin — creates a user in DB and returns JWT cookie
 *   - createSession    — creates a session with the given DM user
 *   - joinSession      — joins a session with invite code
 *   - cleanup          — delete test data by email list
 *
 * Tests use the dev database but clean up after themselves via cascade deletes.
 */

import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from './app';
import prisma from './lib/prisma';

export const app = createApp();

// ── User helpers ──────────────────────────────────────────────────────────────
export async function registerAndLogin(opts: {
  email: string;
  password: string;
  displayName: string;
}): Promise<{ cookie: string; userId: string }> {
  const passwordHash = await argon2.hash(opts.password);
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      passwordHash,
      displayName: opts.displayName,
      emailVerifiedAt: new Date(),
    },
  });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: opts.email, password: opts.password })
    .expect(200);

  const rawCookie = res.headers['set-cookie'];
  const cookie = Array.isArray(rawCookie) ? rawCookie[0] : (rawCookie ?? '');
  return { cookie, userId: user.id };
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
  // Must delete in dependency order to avoid FK violations:
  // sessions reference users (dmId), characters reference users (ownerId)
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  // 1. Delete sessions where user is DM (cascades members, items, characters)
  await prisma.session.deleteMany({ where: { dmId: { in: userIds } } });

  // 2. Delete characters owned by these users (in sessions they joined as players)
  await prisma.character.deleteMany({ where: { ownerId: { in: userIds } } });

  // 3. Delete memberships
  await prisma.sessionMember.deleteMany({ where: { userId: { in: userIds } } });

  // 4. Finally delete the users
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

export { prisma };
