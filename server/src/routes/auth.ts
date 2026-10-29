import { createHash, randomBytes } from 'crypto';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import argon2 from 'argon2';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { signToken, COOKIE_NAME, COOKIE_MAX_AGE } from '../lib/jwt';
import { authenticate } from '../middleware/authenticate';
import { registerSchema, loginSchema } from '../schemas/auth.schema';
import { env } from '../lib/env';
import { isEmailVerificationConfigured, sendEmailVerification } from '../lib/email';

const router = Router();
const googleClient = new OAuth2Client();
const dummyPasswordHash = argon2.hash(randomBytes(32).toString('hex'));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.' },
});
const verificationMessage = 'Adres doğrulanabiliyorsa bir doğrulama bağlantısı gönderildi.';
const googleCredentialSchema = z.object({ credential: z.string().min(1).max(8192) });
const verifyEmailSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/i) });
const emailSchema = z.object({ email: z.string().trim().email().max(254).toLowerCase() });

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Auth cookie: inaccessible to JavaScript and sent only over HTTPS in prod ──
function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
}

function safeUser(user: { id: string; email: string; displayName: string }) {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

async function sendVerificationLink(userId: string, email: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });

  try {
    await sendEmailVerification(email, token);
  } catch (error) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash } });
    throw error;
  }
}

// ── Register with password; account remains locked until the mailbox is proven ──
router.post('/register', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz kayıt bilgileri', details: result.error.flatten() });
    return;
  }

  const { email, password, displayName } = result.data;
  if (!isEmailVerificationConfigured()) {
    res.status(503).json({ error: 'E-posta ile kayıt için doğrulama e-postası ayarları gerekli. Google ile giriş yapabilirsiniz.' });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  // Keep the response the same for existing and new addresses to reduce enumeration.
  if (existing?.emailVerifiedAt) {
    res.status(202).json({ data: { message: verificationMessage } });
    return;
  }

  const user = existing ?? await prisma.user.create({
    data: { email, passwordHash: await argon2.hash(password), displayName },
  });

  try {
    await sendVerificationLink(user.id, user.email);
  } catch {
    console.error('[Auth] Verification email delivery failed');
    res.status(503).json({ error: 'Doğrulama e-postası gönderilemedi. Daha sonra tekrar deneyin.' });
    return;
  }

  res.status(202).json({ data: { message: verificationMessage } });
});

router.post('/resend-verification', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const result = emailSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçerli bir e-posta adresi girin' });
    return;
  }
  if (!isEmailVerificationConfigured()) {
    res.status(503).json({ error: 'E-posta doğrulama hizmeti henüz ayarlanmamış.' });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: result.data.email, mode: 'insensitive' } },
  });
  if (user && !user.emailVerifiedAt) {
    try {
      await sendVerificationLink(user.id, user.email);
    } catch {
      console.error('[Auth] Verification email delivery failed');
    }
  }
  res.status(202).json({ data: { message: verificationMessage } });
});

router.post('/verify-email', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const result = verifyEmailSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.' });
    return;
  }

  const verification = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(result.data.token) },
  });
  if (!verification || verification.expiresAt <= new Date()) {
    if (verification) {
      await prisma.emailVerificationToken.delete({ where: { id: verification.id } });
    }
    res.status(400).json({ error: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: verification.userId },
    data: { emailVerifiedAt: new Date() },
    select: { id: true, email: true, displayName: true },
  });
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  setAuthCookie(res, signToken({ userId: user.id }));
  res.json({ data: safeUser(user) });
});

// ── Verify the Google ID token on the server before creating or linking a user ──
router.post('/google', authLimiter, async (req: Request, res: Response): Promise<void> => {
  if (!env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: 'Google ile giriş henüz yapılandırılmamış.' });
    return;
  }
  const result = googleCredentialSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Google kimlik bilgisi geçersiz.' });
    return;
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: result.data.credential,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    res.status(401).json({ error: 'Google ile kimlik doğrulanamadı.' });
    return;
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    res.status(401).json({ error: 'Google hesabı doğrulanamadı.' });
    return;
  }

  const email = payload.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
  if (!user) {
    user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (user?.googleId && user.googleId !== payload.sub) {
      res.status(409).json({ error: 'Bu e-posta başka bir Google hesabına bağlı.' });
      return;
    }
    if (user) {
      // Google has verified control of this address, so it may confirm a legacy local account.
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: payload.sub, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    } else {
      const displayName = (payload.name || email.split('@')[0]).trim().slice(0, 50) || 'Google kullanıcısı';
      user = await prisma.user.create({
        data: {
          email,
          displayName,
          googleId: payload.sub,
          emailVerifiedAt: new Date(),
          passwordHash: null,
        },
      });
    }
  }

  setAuthCookie(res, signToken({ userId: user.id }));
  res.json({ data: safeUser(user) });
});

router.post('/login', authLimiter, async (req: Request, res: Response): Promise<void> => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: 'Geçersiz giriş bilgileri' });
    return;
  }

  const { email, password } = result.data;
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  const passwordMatch = await argon2.verify(user?.passwordHash ?? await dummyPasswordHash, password);

  if (!user || !passwordMatch) {
    res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    return;
  }
  if (!user.emailVerifiedAt) {
    res.status(403).json({ error: 'Giriş yapmadan önce e-posta adresinizi doğrulayın.' });
    return;
  }

  setAuthCookie(res, signToken({ userId: user.id }));
  res.json({ data: safeUser(user) });
});

router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ data: { message: 'Çıkış yapıldı' } });
});

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
