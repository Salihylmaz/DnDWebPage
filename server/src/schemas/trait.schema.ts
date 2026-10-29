import { z } from 'zod';

// POST /api/sessions/:sessionId/characters/:charId/traits
export const createTraitSchema = z.object({
  type: z.enum(['TRAIT', 'NOTE'], {
    error: () => "type 'TRAIT' veya 'NOTE' olmalıdır",
  }),
  text: z.string().min(1, 'Metin zorunludur').max(1000),
});

// PATCH /api/sessions/:sessionId/characters/:charId/traits/:traitId
export const updateTraitSchema = z.object({
  text: z.string().min(1).max(1000),
});

export type CreateTraitInput = z.infer<typeof createTraitSchema>;
export type UpdateTraitInput = z.infer<typeof updateTraitSchema>;
