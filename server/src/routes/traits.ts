import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember } from '../middleware/session';
import { createTraitSchema, updateTraitSchema } from '../schemas/trait.schema';
import { SOCKET_EVENTS } from '../app';

const router = Router({ mergeParams: true });

router.use(authenticate);

// ── Permission helper ──────────────────────────────────────────────────────────
// Owner or DM can manage traits
async function canManageTrait(
  req: Request,
  character: { ownerId: string }
): Promise<boolean> {
  const { role } = req.sessionMember!;
  return role === 'DM' || character.ownerId === req.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/characters/:charId/traits
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:sessionId/characters/:charId/traits',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;

    const character = await prisma.character.findFirst({ where: { id: charId, sessionId } });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    const traits = await prisma.characterTrait.findMany({
      where: { characterId: charId },
      orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });

    res.json({ data: traits });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions/:sessionId/characters/:charId/traits
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:sessionId/characters/:charId/traits',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;

    const character = await prisma.character.findFirst({ where: { id: charId, sessionId } });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    if (!(await canManageTrait(req, character))) {
      res.status(403).json({ error: 'Bu karakterin özelliklerini düzenleme yetkiniz yok' });
      return;
    }

    const result = createTraitSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    const trait = await prisma.characterTrait.create({
      data: { characterId: charId, type: result.data.type, text: result.data.text },
    });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.TRAIT_CREATED, { ...trait, characterId: charId });

    res.status(201).json({ data: trait });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/sessions/:sessionId/characters/:charId/traits/:traitId
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:sessionId/characters/:charId/traits/:traitId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId, traitId } = req.params;

    const character = await prisma.character.findFirst({ where: { id: charId, sessionId } });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    if (!(await canManageTrait(req, character))) {
      res.status(403).json({ error: 'Bu karakterin özelliklerini düzenleme yetkiniz yok' });
      return;
    }

    const trait = await prisma.characterTrait.findFirst({
      where: { id: traitId, characterId: charId },
    });
    if (!trait) {
      res.status(404).json({ error: 'Özellik bulunamadı' });
      return;
    }

    const result = updateTraitSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
      return;
    }

    const updated = await prisma.characterTrait.update({
      where: { id: traitId },
      data: { text: result.data.text },
    });

    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.TRAIT_UPDATED, { ...updated, characterId: charId });

    res.json({ data: updated });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/:sessionId/characters/:charId/traits/:traitId
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:sessionId/characters/:charId/traits/:traitId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId, traitId } = req.params;

    const character = await prisma.character.findFirst({ where: { id: charId, sessionId } });
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    if (!(await canManageTrait(req, character))) {
      res.status(403).json({ error: 'Bu karakterin özelliklerini düzenleme yetkiniz yok' });
      return;
    }

    const trait = await prisma.characterTrait.findFirst({
      where: { id: traitId, characterId: charId },
    });
    if (!trait) {
      res.status(404).json({ error: 'Özellik bulunamadı' });
      return;
    }

    await prisma.characterTrait.delete({ where: { id: traitId } });
    req.app.locals.io?.to(`session:${sessionId}`).emit(SOCKET_EVENTS.TRAIT_DELETED, { id: traitId, characterId: charId, sessionId });
    res.json({ data: { message: 'Özellik silindi' } });
  }
);

export default router;
