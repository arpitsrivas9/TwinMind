import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { seedDevAccount, getDevAccountEmail, getDevAccountDisplayName } from '../services/devAuthService';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
  };
}

export const requireAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new AppError('Authentication required', 401));
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as {
      id: string;
      email: string;
      name: string;
    };

    // In test environment, bypass database lookup once JWT is verified
    if (process.env.NODE_ENV === 'test' || env.nodeEnv === 'test') {
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
      };
      return next();
    }

    // 1. Check if user with decoded.id exists in the database
    let user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true },
    });

    // 2. If not found, self-heal in development mode (e.g. if DB was recreated or token has mock dev- id)
    if (!user && env.nodeEnv === 'development') {
      const devEmail = env.devDefaultUsername ? getDevAccountEmail(env.devDefaultUsername) : null;
      const devDisplayName = env.devDefaultUsername ? getDevAccountDisplayName(env.devDefaultUsername) : null;

      user = await prisma.user.findFirst({
        where: {
          OR: [
            ...(decoded.email ? [{ email: decoded.email }] : []),
            ...(devEmail ? [{ email: devEmail }] : []),
            ...(decoded.name ? [{ name: decoded.name }] : []),
            ...(devDisplayName ? [{ name: devDisplayName }] : []),
          ],
        },
        select: { id: true, email: true, name: true },
      });

      // If still not found in DB, seed the dev account now
      if (!user) {
        const seeded = await seedDevAccount();
        if (seeded) {
          user = { id: seeded.id, email: seeded.email, name: seeded.name };
        }
      }
    }

    if (!user) {
      return next(new AppError('User not found. Please log in again.', 401));
    }

    req.user = user;
    return next();
  } catch {
    return next(new AppError('Invalid or expired token', 401));
  }
};
