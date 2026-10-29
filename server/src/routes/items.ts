import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember, requireDM } from '../middleware/session';
import { createItemSchema, updateItemSchema } from '../schemas/item.schema';
import { SOCKET_EVENTS } from '../app';

const router = Router({ mergeParams: true });

// All item routes require authentication + session membership
router.use(authenticate);

// ── Helper: format item for client ────────────────────────────────────────────
function formatItem(item: {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  notes: string | null;
  category: 'COMBAT' | 'QUEST';
  ownerCharacterId: string | null;
  createdAt: Date;
}) {
  return { ...item, createdAt: item.createdAt.toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/items — List items (any session member)
// Supports optional ?q= search query (name + description)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:sessionId/items',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const items = await prisma.item.findMany({
      where: {
        sessionId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: items.map(formatItem) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/:sessionId/items
// DM can create any item. Player can only create an item linked to their own character.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:sessionId/items',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params;
    const { role } = req.sessionMember!;

    const result = createItemSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    const { name, description, notes, ownerCharacterId, category } = result.data;

    // Validate ownerCharacterId belongs to this session
    let ownerChar: { id: string; ownerId: string } | null = null;
    if (ownerCharacterId) {
      ownerChar = await prisma.character.findFirst({
        where: { id: ownerCharacterId, sessionId },
        select: { id: true, ownerId: true },
      });
      if (!ownerChar) {
        res.status(400).json({ error: 'Karakter bu oturuma ait değil' });
        return;
      }
    }

    // Non-DM players can only add items to their own character
    if (role === 'PLAYER') {
      if (!ownerChar || ownerChar.ownerId !== req.userId) {
        res.status(403).json({ error: 'Oyuncular yalnızca kendi karakterlerine eşya ekleyebilir' });
        return;
      }
    }

    const item = await prisma.item.create({
      data: {
        sessionId,
        name,
        description: description ?? '',
        notes: notes ?? null,
        category,
        ownerCharacterId: ownerCharacterId ?? null,
      },
    });

    // Notify all session members in realtime
    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.ITEM_CREATED, formatItem(item));

    res.status(201).json({ data: formatItem(item) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/items/:itemId — Single item
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:sessionId/items/:itemId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, itemId } = req.params;

    const item = await prisma.item.findFirst({
      where: { id: itemId, sessionId },
    });

    if (!item) {
      res.status(404).json({ error: 'Eşya bulunamadı' });
      return;
    }

    res.json({ data: formatItem(item) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/:sessionId/items/:itemId — Update item (DM only)
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:sessionId/items/:itemId',
  requireSessionMember,
  requireDM,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, itemId } = req.params;

    const result = updateItemSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    if (Object.keys(result.data).length === 0) {
      res.status(400).json({ error: 'Güncellenecek en az bir alan gereklidir' });
      return;
    }

    const existing = await prisma.item.findFirst({ where: { id: itemId, sessionId } });
    if (!existing) {
      res.status(404).json({ error: 'Eşya bulunamadı' });
      return;
    }

    // Validate ownerCharacterId if provided
    if (result.data.ownerCharacterId) {
      const char = await prisma.character.findFirst({
        where: { id: result.data.ownerCharacterId, sessionId },
      });
      if (!char) {
        res.status(400).json({ error: 'Karakter bu oturuma ait değil' });
        return;
      }
    }

    const updated = await prisma.item.update({
      where: { id: itemId },
      data: result.data,
    });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.ITEM_UPDATED, formatItem(updated));

    res.json({ data: formatItem(updated) });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/:sessionId/items/:itemId — Delete item (DM only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:sessionId/items/:itemId',
  requireSessionMember,
  requireDM,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, itemId } = req.params;

    const existing = await prisma.item.findFirst({ where: { id: itemId, sessionId } });
    if (!existing) {
      res.status(404).json({ error: 'Eşya bulunamadı' });
      return;
    }

    await prisma.item.delete({ where: { id: itemId } });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.ITEM_DELETED, { id: itemId, sessionId });

    res.json({ data: { message: 'Eşya silindi' } });
  }
);

export default router;
