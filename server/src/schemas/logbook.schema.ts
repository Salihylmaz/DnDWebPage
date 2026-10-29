import { z } from 'zod';

export const logbookEntrySchema = z.object({
  title: z.string().trim().min(1, 'Başlık gerekli').max(120),
  summary: z.string().trim().min(1, 'Oturum özeti gerekli').max(10000),
  currentStatus: z.string().trim().max(3000).default(''),
  sessionDate: z.string().date(),
});
