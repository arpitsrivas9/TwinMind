import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { AppError } from '../middleware/errorHandler';
import { createToken, AuthUser, getDevAccountEmail, getDevAccountDisplayName } from './authService';

export { getDevAccountEmail, getDevAccountDisplayName };

/**
 * Seeds or verifies the development default account in PostgreSQL.
 * Strictly disabled when NODE_ENV !== 'development'.
 */
export async function seedDevAccount(): Promise<AuthUser | null> {
  if (env.nodeEnv !== 'development') {
    return null;
  }

  const username = env.devDefaultUsername?.trim();
  const password = env.devDefaultPassword;

  if (!username || !password) {
    return null;
  }

  const email = getDevAccountEmail(username);
  const displayName = getDevAccountDisplayName(username);

  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { name: username },
          { name: displayName },
        ],
      },
    });

    if (existingUser) {
      // Verify password hash is up to date with configured DEV_DEFAULT_PASSWORD
      const matches = await bcrypt.compare(password, existingUser.passwordHash);
      if (!matches) {
        const passwordHash = await bcrypt.hash(password, 12);
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { passwordHash },
        });
        logger.info('Development default account password synchronized');
      }
      return {
        id: existingUser.id,
        email: existingUser.email,
        name: existingUser.name,
      };
    }

    // Seed new development account
    const passwordHash = await bcrypt.hash(password, 12);
    const newUser = await prisma.user.create({
      data: {
        name: displayName,
        email,
        passwordHash,
      },
    });

    logger.info('Development default account seeded successfully');
    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    };
  } catch (error) {
    logger.warn('Failed to seed development default account (database may be pending)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Authenticates the development default account and issues a standard session token.
 * Strictly blocked in production.
 */
export async function authenticateDevUser(): Promise<{ user: AuthUser; token: string }> {
  if (env.nodeEnv !== 'development') {
    throw new AppError('Development authentication is disabled in production', 404);
  }

  const username = env.devDefaultUsername?.trim();
  const password = env.devDefaultPassword;

  if (!username || !password) {
    throw new AppError('Development credentials are not configured in environment', 500);
  }

  const email = getDevAccountEmail(username);
  const displayName = getDevAccountDisplayName(username);

  let devUser = await seedDevAccount();
  if (!devUser) {
    // If DB is offline or pending in development mode, provide fallback dev session
    // so development testing is never blocked when testing UI / SPA / frontend without PostgreSQL
    devUser = {
      id: `dev-${displayName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      email,
      name: displayName,
    };
  }

  const token = createToken(devUser);
  return {
    user: devUser,
    token,
  };
}
