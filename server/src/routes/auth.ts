import { Router, Request, Response } from 'express';
import argon2 from 'argon2';
import prisma from '../lib/prisma';
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '../lib/jwt';
import { authenticate } from '../middleware/authenticate';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { env } from '../lib/env';

const router = Router();

// ── Helper: set the auth cookie ─────────────────────────────────────────────
function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,                          // JS cannot read this cookie
    secure: env.NODE_ENV === 'production',   // HTTPS only in prod
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  });
}

// ── Helper: safe user shape to return to client (never send passwordHash) ───
function safeUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
    return;
  }

  const { email, password, displayName } = result.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı' });
    return;
  }

  const passwordHash = await argon2.hash(password);

  const user = await prisma.user.create({
    data: { email, passwordHash, displayName },
  });

  const token = signToken({ userId: user.id });
  setAuthCookie(res, token);

  res.status(201).json({ data: safeUser(user) });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz veri', details: result.error.flatten() });
    return;
  }

  const { email, password } = result.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Constant-time comparison even on missing user (prevent user enumeration)
  const passwordMatch = user
    ? await argon2.verify(user.passwordHash, password)
    : false;

  if (!user || !passwordMatch) {
    // Same error for both cases — don't reveal whether email exists
    res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    return;
  }

  const token = signToken({ userId: user.id });
  setAuthCookie(res, token);

  res.json({ data: safeUser(user) });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME);
  res.json({ data: { message: 'Çıkış yapıldı' } });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me  (protected)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, email: true, displayName: true },
  });

  if (!user) {
    res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    return;
  }

  res.json({ data: safeUser(user) });
});

export default router;
