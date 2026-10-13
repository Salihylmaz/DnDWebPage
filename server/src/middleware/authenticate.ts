import { Request, Response, NextFunction } from 'express';
import { verifyToken, COOKIE_NAME } from '../lib/jwt';
import prisma from '../lib/prisma';

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * authenticate — reads the JWT from the httpOnly cookie, verifies it,
 * and attaches userId to req. Responds 401 if missing or invalid.
 *
 * Design note: we attach only userId (not the full User object) to keep
 * middleware lightweight. Route handlers fetch the user if they need it.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (!token) {
      res.status(401).json({ error: 'Giriş yapmanız gerekiyor' });
      return;
    }

    const payload = verifyToken(token);

    // Verify user still exists in DB (handles deleted accounts)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });

    if (!user) {
      res.status(401).json({ error: 'Kullanıcı bulunamadı' });
      return;
    }

    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Oturum süresi dolmuş veya geçersiz' });
  }
}
