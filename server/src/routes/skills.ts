import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/authenticate';
import { requireSessionMember } from '../middleware/session';
import { createSkillSchema, updateSkillSchema } from '../schemas/skill.schema';

const router = Router({ mergeParams: true });
router.use(authenticate);

async function findCharacter(sessionId: string, charId: string) {
  return prisma.character.findFirst({
    where: { id: charId, sessionId },
    select: { id: true, ownerId: true },
  });
}

function canManage(req: Request, character: { ownerId: string }) {
  return req.sessionMember?.role === 'DM' || character.ownerId === req.userId;
}

router.get(
  '/:sessionId/characters/:charId/skills',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;
    const character = await findCharacter(sessionId, charId);
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }

    const skills = await prisma.characterSkill.findMany({
      where: { characterId: charId },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.json({ data: skills });
  }
);

router.post(
  '/:sessionId/characters/:charId/skills',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId } = req.params;
    const character = await findCharacter(sessionId, charId);
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }
    if (!canManage(req, character)) {
      res.status(403).json({ error: 'Bu karakterin skilllerini düzenleme yetkiniz yok' });
      return;
    }

    const result = createSkillSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz skill verisi', details: result.error.flatten() });
      return;
    }

    const sortOrder = await prisma.characterSkill.count({ where: { characterId: charId } });
    const skill = await prisma.characterSkill.create({
      data: { ...result.data, characterId: charId, sortOrder },
    });
    res.status(201).json({ data: skill });
  }
);

router.patch(
  '/:sessionId/characters/:charId/skills/:skillId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId, skillId } = req.params;
    const character = await findCharacter(sessionId, charId);
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }
    if (!canManage(req, character)) {
      res.status(403).json({ error: 'Bu karakterin skilllerini düzenleme yetkiniz yok' });
      return;
    }

    const skill = await prisma.characterSkill.findFirst({ where: { id: skillId, characterId: charId } });
    if (!skill) {
      res.status(404).json({ error: 'Skill bulunamadı' });
      return;
    }

    const result = updateSkillSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Geçersiz skill verisi', details: result.error.flatten() });
      return;
    }

    const mergedResult = createSkillSchema.safeParse({ ...skill, ...result.data });
    if (!mergedResult.success) {
      res.status(400).json({ error: 'Mevcut kullanım sayısı toplam hakkı aşamaz', details: mergedResult.error.flatten() });
      return;
    }

    const updated = await prisma.characterSkill.update({
      where: { id: skillId },
      data: result.data,
    });
    res.json({ data: updated });
  }
);

router.delete(
  '/:sessionId/characters/:charId/skills/:skillId',
  requireSessionMember,
  async (req: Request, res: Response): Promise<void> => {
    const { sessionId, charId, skillId } = req.params;
    const character = await findCharacter(sessionId, charId);
    if (!character) {
      res.status(404).json({ error: 'Karakter bulunamadı' });
      return;
    }
    if (!canManage(req, character)) {
      res.status(403).json({ error: 'Bu karakterin skilllerini düzenleme yetkiniz yok' });
      return;
    }

    const skill = await prisma.characterSkill.findFirst({ where: { id: skillId, characterId: charId } });
    if (!skill) {
      res.status(404).json({ error: 'Skill bulunamadı' });
      return;
    }

    await prisma.characterSkill.delete({ where: { id: skillId } });
    res.json({ data: { message: 'Skill silindi' } });
  }
);

export default router;
