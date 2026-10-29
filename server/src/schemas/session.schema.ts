import { z } from 'zod';

export const createSessionSchema = z.object({
  name: z
    .string()
    .min(2, 'Oturum adı en az 2 karakter olmalıdır')
    .max(80, 'Oturum adı en fazla 80 karakter olabilir')
    .trim(),
  description: z.string().max(500).trim().optional(),
});

export const joinSessionSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .length(8, 'Davet kodu geçersiz')
    .regex(/^[A-Z0-9_-]+$/i, 'Davet kodu geçersiz')
    .toUpperCase(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type JoinSessionInput = z.infer<typeof joinSessionSchema>;
