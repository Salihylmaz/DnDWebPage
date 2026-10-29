import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin').max(254).toLowerCase(),
  password: z
    .string()
    .min(12, 'Şifre en az 12 karakter olmalıdır')
    .max(128, 'Şifre en fazla 128 karakter olabilir'),
  displayName: z
    .string()
    .trim()
    .min(2, 'İsim en az 2 karakter olmalıdır')
    .max(50, 'İsim en fazla 50 karakter olabilir'),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  password: z.string().min(1, 'Şifre gereklidir').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
