import { z } from 'zod';

const skillFields = {
  name: z.string().trim().min(1, 'Skill adı zorunludur').max(100),
  subtitle: z.string().trim().max(100).nullable(),
  description: z.string().max(5000),
  skillType: z.string().trim().max(50).nullable(),
  range: z.string().trim().max(100).nullable(),
  actionType: z.enum(['ACTION', 'BONUS_ACTION', 'REACTION', 'FREE', 'OTHER']),
  usesMax: z.number().int().min(0).max(9999),
  usesCurrent: z.number().int().min(0).max(9999),
};

export const createSkillSchema = z.object(skillFields).refine(
  ({ usesMax, usesCurrent }) => usesMax === 0 ? usesCurrent === 0 : usesCurrent <= usesMax,
  { message: 'Mevcut kullanım sayısı toplam hakkı aşamaz; sınırsız skill için 0 kullanın', path: ['usesCurrent'] }
);

export const updateSkillSchema = z.object(skillFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'En az bir alan gönderilmelidir' }
);
