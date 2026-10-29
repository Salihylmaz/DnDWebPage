import { z } from 'zod';

const combatantSchema = z.object({
  id: z.string().min(1).max(80),
  sourceId: z.string().uuid().nullable(),
  kind: z.enum(['CHARACTER', 'NPC', 'MONSTER', 'CUSTOM']),
  name: z.string().trim().min(1).max(100),
  initiative: z.number().int().min(-99).max(999),
}).superRefine((entry, ctx) => {
  if (entry.kind === 'CUSTOM' && entry.sourceId !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Özel dövüşçünün kaynak kaydı olamaz' });
  }
  if (entry.kind !== 'CUSTOM' && entry.sourceId === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Dövüşçü kaynak kaydı gerektirir' });
  }
});

export const saveCombatSchema = z.object({
  round: z.number().int().min(1).max(9999),
  activeEntryId: z.string().min(1).max(80).nullable(),
  isActive: z.boolean(),
  entries: z.array(combatantSchema).max(100),
}).superRefine((state, ctx) => {
  const ids = state.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Dövüşçü kimlikleri benzersiz olmalı' });
  }
  if (state.activeEntryId && !ids.includes(state.activeEntryId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Aktif dövüşçü listede bulunamadı' });
  }
  if (state.isActive && (!state.entries.length || !state.activeEntryId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Başlayan savaşta aktif dövüşçü olmalı' });
  }
});
