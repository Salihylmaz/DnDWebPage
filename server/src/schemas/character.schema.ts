import { z } from 'zod';

// POST /api/sessions/:sessionId/characters
export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Karakter adı zorunludur').max(100),
  class: z.string().min(1, 'Sınıf zorunludur').max(60),
  level: z.number().int().min(1).max(20).default(1),
  // Import-only optional fields — stats and notes can be embedded at creation time
  stats: z
    .array(z.object({ name: z.string().min(1).max(30), value: z.string().max(50) }))
    .optional(),
  notes: z.array(z.string().max(1000)).optional(),
});

// PATCH /api/sessions/:sessionId/characters/:charId
export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  class: z.string().min(1).max(60).optional(),
  level: z.number().int().min(1).max(20).optional(),
});

// PUT /api/sessions/:sessionId/characters/:charId/stats
// Client sends the full stat list; handler upserts each one.
export const upsertStatsSchema = z.object({
  stats: z
    .array(
      z.object({
        name: z.string().min(1).max(30),
        value: z.string().max(50), // flexible: "18", "3d6", "Proficient"
      })
    )
    .min(1, 'En az bir stat gereklidir'),
});

export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;
export type UpsertStatsInput = z.infer<typeof upsertStatsSchema>;
