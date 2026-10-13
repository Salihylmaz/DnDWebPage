/**
 * middleware.test.ts
 *
 * Integration tests for permission middleware:
 *   - requireSessionMember  → non-member gets 403
 *   - requireDM             → PLAYER gets 403 on DM-only routes
 *   - canEditStats          → enforced on PUT /stats endpoint
 *
 * Each describe block creates its own users/session and cleans up in afterAll.
 */

import request from 'supertest';
import {
  app,
  prisma,
  registerAndLogin,
  createSession,
  joinSession,
  cleanup,
} from '../testHelpers';

// ─────────────────────────────────────────────────────────────────────────────
// requireSessionMember
// ─────────────────────────────────────────────────────────────────────────────
describe('requireSessionMember middleware', () => {
  let dmCookie: string;
  let outsiderCookie: string;
  let sessionId: string;
  const emails = ['mw-dm@test.com', 'mw-outsider@test.com'];

  beforeAll(async () => {
    const dm = await registerAndLogin({
      email: emails[0],
      password: 'TestPass1!',
      displayName: 'MW DM',
    });
    const outsider = await registerAndLogin({
      email: emails[1],
      password: 'TestPass1!',
      displayName: 'MW Outsider',
    });
    dmCookie = dm.cookie;
    outsiderCookie = outsider.cookie;

    const session = await createSession(dmCookie, 'MW Test Session');
    sessionId = session.sessionId;
  });

  afterAll(async () => {
    await cleanup(emails);
  });

  it('returns 403 when user is not a session member', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Cookie', outsiderCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('returns 200 when user IS a session member (DM)', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}`)
      .set('Cookie', dmCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(sessionId);
  });

  it('returns 401 when no cookie is provided', async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireDM
// ─────────────────────────────────────────────────────────────────────────────
describe('requireDM middleware', () => {
  let dmCookie: string;
  let playerCookie: string;
  let sessionId: string;
  let inviteCode: string;
  const emails = ['dm-check-dm@test.com', 'dm-check-player@test.com'];

  beforeAll(async () => {
    const dm = await registerAndLogin({
      email: emails[0],
      password: 'TestPass1!',
      displayName: 'DM Check DM',
    });
    const player = await registerAndLogin({
      email: emails[1],
      password: 'TestPass1!',
      displayName: 'DM Check Player',
    });
    dmCookie = dm.cookie;
    playerCookie = player.cookie;

    const session = await createSession(dmCookie, 'DM Check Session');
    sessionId = session.sessionId;
    inviteCode = session.inviteCode;
    await joinSession(playerCookie, inviteCode);
  });

  afterAll(async () => {
    await cleanup(emails);
  });

  it('allows DM to add an item', async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/items`)
      .set('Cookie', dmCookie)
      .send({ name: 'Test Item', description: 'A test item' });

    expect(res.status).toBe(201);
  });

  it('blocks PLAYER from adding an item (DM-only)', async () => {
    const res = await request(app)
      .post(`/api/sessions/${sessionId}/items`)
      .set('Cookie', playerCookie)
      .send({ name: 'Player Item', description: 'Should fail' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('blocks PLAYER from changing session settings (DM-only)', async () => {
    const res = await request(app)
      .patch(`/api/sessions/${sessionId}/settings`)
      .set('Cookie', playerCookie)
      .send({ playersCanEditStats: false });

    expect(res.status).toBe(403);
  });

  it('allows DM to change session settings', async () => {
    const res = await request(app)
      .patch(`/api/sessions/${sessionId}/settings`)
      .set('Cookie', dmCookie)
      .send({ playersCanEditStats: false });

    expect(res.status).toBe(200);
    expect(res.body.data.playersCanEditStats).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canEditStats
// ─────────────────────────────────────────────────────────────────────────────
describe('canEditStats permission', () => {
  let dmCookie: string;
  let playerCookie: string;
  let sessionId: string;
  let inviteCode: string;
  let charId: string;
  const emails = ['ces-dm@test.com', 'ces-player@test.com'];

  beforeAll(async () => {
    const dm = await registerAndLogin({
      email: emails[0],
      password: 'TestPass1!',
      displayName: 'CES DM',
    });
    const player = await registerAndLogin({
      email: emails[1],
      password: 'TestPass1!',
      displayName: 'CES Player',
    });
    dmCookie = dm.cookie;
    playerCookie = player.cookie;

    const session = await createSession(dmCookie, 'CES Session');
    sessionId = session.sessionId;
    inviteCode = session.inviteCode;
    await joinSession(playerCookie, inviteCode);

    // Player creates their character
    const charRes = await request(app)
      .post(`/api/sessions/${sessionId}/characters`)
      .set('Cookie', playerCookie)
      .send({ name: 'CES Hero', class: 'Fighter', level: 1 });

    expect(charRes.status).toBe(201);
    charId = charRes.body.data.id;
  });

  afterAll(async () => {
    await cleanup(emails);
  });

  const newStats = [{ name: 'STR', value: '18' }, { name: 'HP', value: '30' }];

  it('allows DM to edit stats regardless of setting', async () => {
    // First, disable stats editing for players
    await request(app)
      .patch(`/api/sessions/${sessionId}/settings`)
      .set('Cookie', dmCookie)
      .send({ playersCanEditStats: false });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/characters/${charId}/stats`)
      .set('Cookie', dmCookie)
      .send({ stats: newStats });

    expect(res.status).toBe(200);
  });

  it('blocks PLAYER from editing stats when playersCanEditStats=false', async () => {
    // Ensure setting is false
    await request(app)
      .patch(`/api/sessions/${sessionId}/settings`)
      .set('Cookie', dmCookie)
      .send({ playersCanEditStats: false });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/characters/${charId}/stats`)
      .set('Cookie', playerCookie)
      .send({ stats: newStats });

    expect(res.status).toBe(403);
    expect(res.body.error).toBeDefined();
  });

  it('allows PLAYER to edit stats when playersCanEditStats=true', async () => {
    // Enable stats editing
    await request(app)
      .patch(`/api/sessions/${sessionId}/settings`)
      .set('Cookie', dmCookie)
      .send({ playersCanEditStats: true });

    const res = await request(app)
      .put(`/api/sessions/${sessionId}/characters/${charId}/stats`)
      .set('Cookie', playerCookie)
      .send({ stats: newStats });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(newStats.length);
  });

  it('blocks PLAYER from editing another player\'s stats', async () => {
    // Create a second player and their character
    const player2 = await registerAndLogin({
      email: 'ces-player2@test.com',
      password: 'TestPass1!',
      displayName: 'CES Player2',
    });
    await joinSession(player2.cookie, inviteCode);

    const char2Res = await request(app)
      .post(`/api/sessions/${sessionId}/characters`)
      .set('Cookie', player2.cookie)
      .send({ name: 'CES Hero 2', class: 'Wizard', level: 1 });

    const char2Id = char2Res.body.data.id;

    // Player 1 tries to edit Player 2's character stats
    const res = await request(app)
      .put(`/api/sessions/${sessionId}/characters/${char2Id}/stats`)
      .set('Cookie', playerCookie)
      .send({ stats: newStats });

    expect(res.status).toBe(403);

    await cleanup(['ces-player2@test.com']);
  });
});
