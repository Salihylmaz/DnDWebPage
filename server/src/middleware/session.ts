import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

/**
 * requireSessionMember
 * Verifies the authenticated user is a member of the session (DM or PLAYER).
 * Attaches `req.sessionMember` for downstream handlers.
 *
 * Expects: req.userId (set by authenticate), req.params.sessionId
 */
export async function requireSessionMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const { sessionId } = req.params;

  const member = await prisma.sessionMember.findUnique({
    where: {
      sessionId_userId: {
        sessionId,
        userId: req.userId!,
      },
    },
    include: { session: true },
  });

  if (!member) {
    res.status(403).json({ error: 'Bu oturuma erişim yetkiniz yok' });
    return;
  }

  req.sessionMember = member;
  next();
}

/**
 * requireDM
 * Must be used AFTER requireSessionMember.
 * Ensures the user is the DM of the session.
 */
export function requireDM(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.sessionMember?.role !== 'DM') {
    res.status(403).json({ error: 'Bu işlem için DM yetkisi gereklidir' });
    return;
  }
  next();
}

// Extend Express Request type with our custom fields
declare global {
  namespace Express {
    interface Request {
      sessionMember?: import('@prisma/client').SessionMember & {
        session: import('@prisma/client').Session;
      };
    }
  }
}
