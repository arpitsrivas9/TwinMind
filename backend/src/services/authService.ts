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

export const loginUser = async (email: string, password: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

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
    throw new AppError('User not found', 404);
  }

  return user;
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

const createToken = (payload: AuthUser) => {
  const expiresIn = env.jwtExpiresIn === '7d' ? 60 * 60 * 24 * 7 : Number(env.jwtExpiresIn) || 60 * 60 * 24 * 7;

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn,
  });
};
