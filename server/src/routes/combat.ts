import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember } from '../middleware/session';
import { saveCombatSchema } from '../schemas/combat.schema';

const router = Router({ mergeParams: true });
router.use(authenticate);

type CombatantEntry = {
  id: string;
  sourceId: string | null;
  kind: 'CHARACTER' | 'NPC' | 'MONSTER' | 'CUSTOM';
  name: string;
  initiative: number;
};

type CombatResponse = {
  sessionId: string;
  round: number;
  activeEntryId: string | null;
  isActive: boolean;
  entries: CombatantEntry[];
  updatedAt: string;
};

router.get('/:sessionId/combat', requireSessionMember, async (req: Request, res: Response): Promise<void> => {
  const state = await prisma.sessionCombat.findUnique({ where: { sessionId: req.params.sessionId } });
  if (!state) {
    res.json({ data: null });
    return;
  }
  const data: CombatResponse = {
    sessionId: state.sessionId,
    round: state.round,
    activeEntryId: state.activeEntryId,
    isActive: state.isActive,
    entries: state.entries as unknown as CombatantEntry[],
    updatedAt: state.updatedAt.toISOString(),
  };
  res.json({ data });
});

router.put('/:sessionId/combat', requireSessionMember, async (req: Request, res: Response): Promise<void> => {
  if (req.sessionMember?.role !== 'DM') {
    res.status(403).json({ error: 'Tur sırasını yalnızca DM düzenleyebilir' });
    return;
  }

  const result = saveCombatSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz tur sırası', details: result.error.flatten() });
    return;
  }

  const { entries, ...fields } = result.data;
  const characterIds = entries.filter((entry) => entry.kind === 'CHARACTER').map((entry) => entry.sourceId!);
  const creatureIds = entries.filter((entry) => entry.kind === 'NPC' || entry.kind === 'MONSTER').map((entry) => entry.sourceId!);
  const [characters, creatures] = await Promise.all([
    characterIds.length ? prisma.character.findMany({ where: { id: { in: characterIds }, sessionId: req.params.sessionId }, select: { id: true } }) : [],
    creatureIds.length ? prisma.sessionCreature.findMany({ where: { id: { in: creatureIds }, sessionId: req.params.sessionId }, select: { id: true, kind: true } }) : [],
  ]);
  const validCharacters = new Set(characters.map((entry) => entry.id));
  const validCreatures = new Map(creatures.map((entry) => [entry.id, entry.kind]));
  const hasInvalidSource = entries.some((entry) => {
    if (entry.kind === 'CHARACTER') return !validCharacters.has(entry.sourceId!);
    if (entry.kind === 'NPC' || entry.kind === 'MONSTER') return validCreatures.get(entry.sourceId!) !== entry.kind;
    return false;
  });
  if (hasInvalidSource) {
    res.status(400).json({ error: 'Dövüşçüler bu oturuma ait değil veya türü değişmiş' });
    return;
  }

  const saved = await prisma.sessionCombat.upsert({
    where: { sessionId: req.params.sessionId },
    create: { sessionId: req.params.sessionId, ...fields, entries: entries as unknown as Prisma.InputJsonValue },
    update: { ...fields, entries: entries as unknown as Prisma.InputJsonValue },
  });
  const data: CombatResponse = {
    sessionId: saved.sessionId,
    round: saved.round,
    activeEntryId: saved.activeEntryId,
    isActive: saved.isActive,
    entries: saved.entries as unknown as CombatantEntry[],
    updatedAt: saved.updatedAt.toISOString(),
  };
  req.app.locals.io?.to(`session:${req.params.sessionId}`).emit('combat:updated');
  res.json({ data });
});

export default router;
