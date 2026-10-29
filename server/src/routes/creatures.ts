import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember } from '../middleware/session';
import { createCreatureSchema, updateCreatureSchema } from '../schemas/creature.schema';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get(
  '/:sessionId/creatures',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const creatures = await prisma.sessionCreature.findMany({
      where: {
        sessionId: req.params.sessionId,
        ...(req.sessionMember?.role === 'PLAYER' ? { isVisibleToPlayers: true } : {}),
      },
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({ data: creatures });
  }
);

router.post(
  '/:sessionId/creatures',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    if (req.sessionMember?.role !== 'DM') {
      res.status(403).json({ error: 'NPC ve canavarları yalnızca DM ekleyebilir' });
      return;
    }
    const result = createCreatureSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz kayıt', details: result.error.flatten() });
      return;
    }
    const creature = await prisma.sessionCreature.create({
      data: { ...result.data, sessionId: req.params.sessionId },
    });
    res.status(201).json({ data: creature });
  }
);

router.patch(
  '/:sessionId/creatures/:creatureId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    if (req.sessionMember?.role !== 'DM') {
      res.status(403).json({ error: 'NPC ve canavarları yalnızca DM düzenleyebilir' });
      return;
    }
    const current = await prisma.sessionCreature.findFirst({
      where: { id: req.params.creatureId, sessionId: req.params.sessionId },
    });
    if (!current) {
      res.status(404).json({ error: 'Kayıt bulunamadı' });
      return;
    }
    const result = updateCreatureSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz kayıt', details: result.error.flatten() });
      return;
    }
    const updated = await prisma.sessionCreature.update({ where: { id: current.id }, data: result.data });
    res.json({ data: updated });
  }
);

router.delete(
  '/:sessionId/creatures/:creatureId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    if (req.sessionMember?.role !== 'DM') {
      res.status(403).json({ error: 'NPC ve canavarları yalnızca DM silebilir' });
      return;
    }
    const current = await prisma.sessionCreature.findFirst({
      where: { id: req.params.creatureId, sessionId: req.params.sessionId },
      select: { id: true },
    });
    if (!current) {
      res.status(404).json({ error: 'Kayıt bulunamadı' });
      return;
    }
    await prisma.sessionCreature.delete({ where: { id: current.id } });
    res.json({ data: { message: 'Kayıt silindi' } });
  }
);

export default router;
