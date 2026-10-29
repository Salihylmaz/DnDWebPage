import { z } from 'zod';

// Used for POST /api/sessions/:sessionId/items
export const createItemSchema = z.object({
  name: z.string().min(1, 'İsim zorunludur').max(120),
  description: z.string().max(2000).optional().default(''),
  notes: z.string().max(2000).optional(),
  category: z.enum(['COMBAT', 'QUEST']).optional().default('COMBAT'),
  ownerCharacterId: z.string().uuid().nullable().optional(),
});

// Used for PATCH /api/sessions/:sessionId/items/:itemId
// All fields are optional; at least one must be provided (checked in handler)
export const updateItemSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  notes: z.string().max(2000).nullable().optional(),
  category: z.enum(['COMBAT', 'QUEST']).optional(),
  ownerCharacterId: z.string().uuid().nullable().optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
