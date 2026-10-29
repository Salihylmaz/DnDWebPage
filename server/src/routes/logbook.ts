import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireDM, requireSessionMember } from '../middleware/session';
import { logbookEntrySchema } from '../schemas/logbook.schema';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/:sessionId/logbook', requireSessionMember, async (req: Request, res: Response): Promise<void> => {
  const entries = await prisma.logbookEntry.findMany({
    where: { sessionId: req.params.sessionId },
    orderBy: [{ sessionDate: 'desc' }, { createdAt: 'desc' }],
  });
  res.json({ data: entries.map((entry) => ({
    ...entry,
    sessionDate: entry.sessionDate.toISOString().slice(0, 10),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  })) });
});

router.post('/:sessionId/logbook', requireSessionMember, requireDM, async (req: Request, res: Response): Promise<void> => {
  const result = logbookEntrySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz günlük kaydı', details: result.error.flatten() });
    return;
  }
  const entry = await prisma.logbookEntry.create({
    data: { ...result.data, sessionDate: new Date(`${result.data.sessionDate}T12:00:00.000Z`), sessionId: req.params.sessionId },
  });
  req.app.locals.io?.to(`session:${req.params.sessionId}`).emit('logbook:updated');
  res.status(201).json({ data: {
    ...entry,
    sessionDate: entry.sessionDate.toISOString().slice(0, 10),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  } });
});

router.patch('/:sessionId/logbook/:entryId', requireSessionMember, requireDM, async (req: Request, res: Response): Promise<void> => {
  const result = logbookEntrySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz günlük kaydı', details: result.error.flatten() });
    return;
  }
  const existing = await prisma.logbookEntry.findFirst({
    where: { id: req.params.entryId, sessionId: req.params.sessionId }, select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Günlük kaydı bulunamadı' });
    return;
  }
  const entry = await prisma.logbookEntry.update({
    where: { id: existing.id },
    data: { ...result.data, sessionDate: new Date(`${result.data.sessionDate}T12:00:00.000Z`) },
  });
  req.app.locals.io?.to(`session:${req.params.sessionId}`).emit('logbook:updated');
  res.json({ data: {
    ...entry,
    sessionDate: entry.sessionDate.toISOString().slice(0, 10),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  } });
});

router.delete('/:sessionId/logbook/:entryId', requireSessionMember, requireDM, async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.logbookEntry.findFirst({
    where: { id: req.params.entryId, sessionId: req.params.sessionId }, select: { id: true },
  });
  if (!existing) {
    res.status(404).json({ error: 'Günlük kaydı bulunamadı' });
    return;
  }
  await prisma.logbookEntry.delete({ where: { id: existing.id } });
  req.app.locals.io?.to(`session:${req.params.sessionId}`).emit('logbook:updated');
  res.json({ data: { message: 'Günlük kaydı silindi' } });
});

export default router;
