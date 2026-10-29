import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { nanoid } from 'nanoid';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember, requireDM } from '../middleware/session';
import { createSessionSchema, joinSessionSchema } from '../schemas/session.schema';

const router = Router();
const inviteCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla davet kodu denendi. Lütfen daha sonra tekrar deneyin.' },
});

// All session routes require authentication
router.use(authenticate);

// ── Helper: shape session for client ─────────────────────────────────────────
function formatSession(session: {
  id: string;
  name: string;
  description: string | null;
  dmId: string;
  inviteCode: string;
  playersCanEditStats: boolean;
  createdAt: Date;
}) {
  return { ...session, createdAt: session.createdAt.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions — Create a new session (creator becomes DM)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const result = createSessionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
    return;
  }

  const { name, description } = result.data;

  // nanoid(8) generates an 8-char uppercase-friendly code, e.g. "AB3X9KQM"
  const inviteCode = nanoid(8).toUpperCase();

  const session = await prisma.session.create({
    data: {
      name,
      description: description ?? null,
      inviteCode,
      dmId: req.userId!,
      members: {
        create: { userId: req.userId!, role: 'DM' },
      },
    },
  });

  res.status(201).json({ data: formatSession(session) });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions — List sessions the current user is a member of
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const memberships = await prisma.sessionMember.findMany({
    where: { userId: req.userId! },
    include: {
      session: true,
    },
    orderBy: { session: { createdAt: 'desc' } },
  });

  const sessions = memberships.map((m) => ({
    ...formatSession(m.session),
    role: m.role,
  }));

  res.json({ data: sessions });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/join — Join via invite code
// ─────────────────────────────────────────────────────────────────────────────
router.post('/join', inviteCodeLimiter, async (req: Request, res: Response): Promise<void> => {
  const result = joinSessionSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
    return;
  }

  const { inviteCode } = result.data;

  const session = await prisma.session.findUnique({ where: { inviteCode } });
  if (!session) {
    res.status(404).json({ error: 'Geçersiz davet kodu' });
    return;
  }

  // Check if user is already a member
  const existing = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId: session.id, userId: req.userId! } },
  });
  if (existing) {
    // Idempotent: just return the session (client may retry)
    res.json({ data: { ...formatSession(session), role: existing.role } });
    return;
  }

  // DM cannot join their own session as a player
  if (session.dmId === req.userId) {
    res.status(409).json({ error: 'Bu oturumun DM\'isiniz, zaten üyesiniz' });
    return;
  }

  await prisma.sessionMember.create({
    data: { sessionId: session.id, userId: req.userId!, role: 'PLAYER' },
  });

  res.status(201).json({ data: { ...formatSession(session), role: 'PLAYER' } });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId — Session detail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId', requireSessionMember, async (req: Request, res: Response): Promise<void> => {
  const session = req.sessionMember!.session;
  res.json({ data: { ...formatSession(session), role: req.sessionMember!.role } });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/members — Member list
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/members', requireSessionMember, async (req: Request, res: Response): Promise<void> => {
  const members = await prisma.sessionMember.findMany({
    where: { sessionId: req.params.sessionId },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { role: 'asc' }, // DM first
  });

  res.json({ data: members });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/:sessionId/members/:userId — Remove a player (DM only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:sessionId/members/:userId',
  requireSessionMember,
  requireDM,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, userId } = req.params;

    // DM cannot remove themselves
    if (userId === req.userId) {
      res.status(400).json({ error: 'DM kendini oturumdan çıkaramaz' });
      return;
    }

    const member = await prisma.sessionMember.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!member) {
      res.status(404).json({ error: 'Üye bulunamadı' });
      return;
    }

    await prisma.sessionMember.delete({
      where: { sessionId_userId: { sessionId, userId } },
    });

    res.json({ data: { message: 'Üye oturumdan çıkarıldı' } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/:sessionId/settings — Update session settings (DM only)
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:sessionId/settings',
  requireSessionMember,
  requireDM,
  async (req: Request, res: Response): Promise<void> => {
    const { playersCanEditStats } = req.body as { playersCanEditStats?: boolean };

    if (typeof playersCanEditStats !== 'boolean') {
      res.status(400).json({ error: 'playersCanEditStats boolean olmalıdır' });
      return;
    }

    const updated = await prisma.session.update({
      where: { id: req.params.sessionId },
      data: { playersCanEditStats },
    });

    res.json({ data: formatSession(updated) });
  }
);

export default router;
