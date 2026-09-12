import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export const registerUser = async (name: string, email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    throw new AppError('User already exists', 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    token: createToken({ id: user.id, email: user.email, name: user.name }),
  };
};

export function getDevAccountDisplayName(username: string): string {
  const trimmed = username.trim().replace(/^["']|["']$/g, '');
  return trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;
}

export function getDevAccountEmail(username: string): string {
  const trimmed = username.trim().toLowerCase().replace(/^["']|["']$/g, '');
  return trimmed.includes('@') ? trimmed : `${trimmed}@twinmind.dev`;
}

export const loginUser = async (identifier: string, password: string) => {
  const normalized = identifier.trim().toLowerCase().replace(/^["']|["']$/g, '');
  const cleanIdentifier = identifier.trim().replace(/^["']|["']$/g, '');
  const cleanInputPassword = password.trim().replace(/^["']|["']$/g, '');
  const cleanDevUsername = (env.devDefaultUsername || '').trim().replace(/^["']|["']$/g, '');
  const cleanDevPassword = (env.devDefaultPassword || '').trim().replace(/^["']|["']$/g, '');

  const devEmail = getDevAccountEmail(cleanDevUsername);
  const devDisplayName = getDevAccountDisplayName(cleanDevUsername);

  // In development, if configured dev credentials match, provide instant resilient authentication
  if (
    env.nodeEnv === 'development' &&
    cleanDevUsername &&
    cleanDevPassword &&
    (normalized === cleanDevUsername.toLowerCase() ||
      normalized === devEmail.toLowerCase() ||
      normalized === devDisplayName.toLowerCase() ||
      cleanIdentifier.toLowerCase() === cleanDevUsername.toLowerCase() ||
      cleanIdentifier.toLowerCase() === devDisplayName.toLowerCase() ||
      normalized === `${devDisplayName.toLowerCase()}@twinmind.dev`) &&
    cleanInputPassword === cleanDevPassword
  ) {
    try {
      let user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: normalized },
            { email: devEmail },
            { name: identifier.trim() },
            { name: devDisplayName },
            { email: `${normalized}@twinmind.dev` },
          ],
        },
      });

      if (!user) {
        const passwordHash = await bcrypt.hash(cleanDevPassword, 12);
        user = await prisma.user.create({
          data: {
            name: devDisplayName,
            email: devEmail,
            passwordHash,
          },
        });
      }

      if (user) {
        return {
          user: { id: user.id, email: user.email, name: user.name },
          token: createToken({ id: user.id, email: user.email, name: user.name }),
        };
      }
    } catch {
      // Fall through to dev fallback session below
    }

    const devUser: AuthUser = {
      id: `dev-${devDisplayName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      email: devEmail,
      name: devDisplayName,
    };
    return {
      user: devUser,
      token: createToken(devUser),
    };
  }

  let user;
  try {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalized },
          { name: identifier.trim() },
          { email: `${normalized}@twinmind.dev` },
        ],
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid credentials', 401);
  }

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);

  if (!validPassword) {
    throw new AppError('Invalid credentials', 401);
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
    token: createToken({ id: user.id, email: user.email, name: user.name }),
  };
};

export const getUserById = async (id: string) => {
  const devEmail = env.devDefaultUsername ? getDevAccountEmail(env.devDefaultUsername) : 'dev@twinmind.dev';
  const devDisplayName = env.devDefaultUsername ? getDevAccountDisplayName(env.devDefaultUsername) : 'Developer';

  if (env.nodeEnv === 'development' && (id.startsWith('dev-') || !env.devDefaultUsername)) {
    return {
      id,
      name: devDisplayName,
      email: devEmail,
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      if (env.nodeEnv === 'development') {
        return {
          id,
          name: devDisplayName,
          email: devEmail,
          avatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      throw new AppError('User not found', 404);
    }

    return user;
  } catch (error) {
    if (env.nodeEnv === 'development') {
      return {
        id,
        name: devDisplayName,
        email: devEmail,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    throw error;
  }
};

export const updateUserProfile = async (id: string, name: string, avatarUrl?: string | null) => {
  const user = await prisma.user.update({
    where: { id },
    data: {
      name,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user;
};

export const createToken = (payload: AuthUser, customExpiresIn?: number | string) => {
  const expiresIn = customExpiresIn ?? (
    env.nodeEnv === 'development'
      ? 60 * 60 * 24 * 30 // 30-day session lifetime for persistent dev testing
      : env.jwtExpiresIn === '7d'
        ? 60 * 60 * 24 * 7
        : Number(env.jwtExpiresIn) || 60 * 60 * 24 * 7
  );

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
};
