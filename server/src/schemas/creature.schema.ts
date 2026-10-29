import { z } from 'zod';

const creatureFields = {
  kind: z.enum(['NPC', 'MONSTER']),
  name: z.string().trim().min(1).max(100),
  summary: z.string().max(4000),
  hp: z.number().int().min(0).max(99999).nullable(),
  maxHp: z.number().int().min(0).max(99999).nullable(),
  armorClass: z.number().int().min(0).max(999).nullable(),
  initiative: z.number().int().min(-99).max(999).nullable(),
  isVisibleToPlayers: z.boolean(),
};

export const createCreatureSchema = z.object(creatureFields);
export const updateCreatureSchema = z.object(creatureFields).partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'En az bir alan gönderilmelidir' }
);
