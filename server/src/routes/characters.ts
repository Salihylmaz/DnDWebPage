import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember, requireDM } from '../middleware/session';
import {
  createCharacterSchema,
  updateCharacterSchema,
  upsertStatsSchema,
} from '../schemas/character.schema';
import { SOCKET_EVENTS } from '../app';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// canEditStats helper
// Resolves to true if the requester may modify stats for the given character.
// Rule: DM always can. Player can only if session.playersCanEditStats is true
//       AND the character belongs to them.
// ─────────────────────────────────────────────────────────────────────────────
function canEditStats(
  req: Request,
  character: { ownerId: string }
): boolean {
  const { role, session } = req.sessionMember!;
  if (role === 'DM') return true;
  return session.playersCanEditStats && character.ownerId === req.userId;
}

// Default stat set created with every new character
const DEFAULT_STATS = [
  { name: 'STR', value: '10' },
  { name: 'DEX', value: '10' },
  { name: 'CON', value: '10' },
  { name: 'INT', value: '10' },
  { name: 'WIS', value: '10' },
  { name: 'CHA', value: '10' },
  { name: 'HP',  value: '10' },
  { name: 'AC',  value: '10' },
];

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatCharacter(char: {
  id: string;
  sessionId: string;
  ownerId: string;
  name: string;
  class: string;
  level: number;
  createdAt: Date;
  stats?: Array<{ id: string; characterId: string; name: string; value: string }>;
  traits?: Array<{ id: string; characterId: string; type: string; text: string }>;
}) {
  return { ...char, createdAt: char.createdAt.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/characters — List characters in session
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:sessionId/characters',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;

    const characters = await prisma.character.findMany({
      where: { sessionId },
      include: {
        stats: { orderBy: { name: 'asc' } },
        owner: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: characters.map(formatCharacter) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/:sessionId/characters — Create a character
// Any session member can create one character. DM may create multiple.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:sessionId/characters',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    const { role } = req.sessionMember!;

    const result = createCharacterSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    // Non-DM players: can only have one character per session
    if (role === 'PLAYER') {
      const existing = await prisma.character.findFirst({
        where: { sessionId, ownerId: req.userId! },
      });
      if (existing) {
        res.status(409).json({ error: 'Bu oturumda zaten bir karakteriniz var' });
        return;
      }
    }

    const { name, class: charClass, level, stats: inputStats, notes: inputNotes } = result.data;

    // If stats are provided in the payload, merge them over defaults (provided values take priority)
    const statEntries = (() => {
      if (!inputStats || inputStats.length === 0) return DEFAULT_STATS;
      const overrideMap: Record<string, string> = {};
      for (const s of inputStats) overrideMap[s.name.toUpperCase()] = s.value;
      return DEFAULT_STATS.map((d) =>
        overrideMap[d.name] !== undefined ? { name: d.name, value: overrideMap[d.name] } : d
      ).concat(
        inputStats
          .filter((s) => !DEFAULT_STATS.some((d) => d.name === s.name.toUpperCase()))
          .map((s) => ({ name: s.name.toUpperCase(), value: s.value }))
      );
    })();

    const character = await prisma.character.create({
      data: {
        sessionId,
        ownerId: req.userId!,
        name,
        class: charClass,
        level,
        stats: {
          create: statEntries,
        },
        ...(inputNotes && inputNotes.length > 0
          ? {
              traits: {
                create: inputNotes
                  .filter((t) => t.trim())
                  .map((text) => ({ type: 'NOTE', text: text.trim() })),
              },
            }
          : {}),
      },
      include: {
        stats: { orderBy: { name: 'asc' } },
        traits: { orderBy: { type: 'asc' } },
      },
    });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.CHARACTER_CREATED, formatCharacter(character));

    res.status(201).json({ data: formatCharacter(character) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/characters/:charId — Character detail
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:sessionId/characters/:charId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;

    const character = await prisma.character.findFirst({
      where: { id: charId, sessionId },
      include: {
        stats: { orderBy: { name: 'asc' } },
        traits: { orderBy: { type: 'asc' } },
        owner: { select: { id: true, displayName: true } },
      },
    });

    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    res.json({ data: formatCharacter(character) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/:sessionId/characters/:charId — Update basic info
// Owner or DM can update name/class/level
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:sessionId/characters/:charId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;
    const { role } = req.sessionMember!;

    const character = await prisma.character.findFirst({
      where: { id: charId, sessionId },
    });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    // Only owner or DM
    if (role !== 'DM' && character.ownerId !== req.userId) {
      res.status(403).json({ error: 'Bu karakteri düzenleme yetkiniz yok' });
      return;
    }

    const result = updateCharacterSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    if (Object.keys(result.data).length === 0) {
      res.status(400).json({ error: 'Güncellenecek en az bir alan gereklidir' });
      return;
    }

    const updated = await prisma.character.update({
      where: { id: charId },
      data: { ...result.data, class: result.data.class },
      include: {
        stats: { orderBy: { name: 'asc' } },
        traits: { orderBy: { type: 'asc' } },
      },
    });

    res.json({ data: formatCharacter(updated) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/:sessionId/characters/:charId — Delete character (DM only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:sessionId/characters/:charId',
  requireSessionMember,
  requireDM,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;

    const character = await prisma.character.findFirst({
      where: { id: charId, sessionId },
    });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    await prisma.character.delete({ where: { id: charId } });
    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.CHARACTER_DELETED, { id: charId, sessionId });
    res.json({ data: { message: 'Karakter silindi' } });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/sessions/:sessionId/characters/:charId/stats — Bulk upsert stats
// DM always allowed. Player allowed only if session.playersCanEditStats = true
// and the character belongs to them.
//
// Design: client sends the complete stat list; we delete stats not in the list
// and upsert the rest. This keeps the UI simple (no separate add/delete calls).
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  '/:sessionId/characters/:charId/stats',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;

    const character = await prisma.character.findFirst({
      where: { id: charId, sessionId },
    });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    if (!canEditStats(req, character)) {
      res.status(403).json({
        error: 'Bu karakterin statlarını düzenleme yetkiniz yok',
      });
      return;
    }

    const result = upsertStatsSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    const { stats } = result.data;

    // Transaction: delete all existing stats for this character, then create new ones.
    // This approach is simple and safe for our scale.
    const updatedStats = await prisma.$transaction(async (tx) => {
      await tx.characterStat.deleteMany({ where: { characterId: charId } });
      return tx.characterStat.createMany({
        data: stats.map((s) => ({ characterId: charId, name: s.name, value: s.value })),
      });
    });

    // Return the full updated stat list
    const freshStats = await prisma.characterStat.findMany({
      where: { characterId: charId },
      orderBy: { name: 'asc' },
    });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.STAT_UPDATED, { characterId: charId, sessionId });

    res.json({ data: freshStats });
  }
);

export default router;
