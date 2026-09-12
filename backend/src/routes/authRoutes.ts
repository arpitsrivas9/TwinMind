import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser } from '../services/authService';
import { authenticateDevUser } from '../services/devAuthService';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const signupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().min(2).max(128).optional(),
  identifier: z.string().min(2).max(128).optional(),
  username: z.string().min(2).max(128).optional(),
  password: z.string().min(6).max(128),
}).refine((data) => data.email || data.identifier || data.username, {
  message: 'Username or email is required',
  path: ['email'],
});

router.post('/signup', async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const result = await registerUser(parsed.data.name, parsed.data.email, parsed.data.password);
    return res.status(201).json(successResponse(result));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Signup failed', 500));
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const identifier = (parsed.data.email || parsed.data.identifier || parsed.data.username) as string;
    const result = await loginUser(identifier, parsed.data.password);
    return res.status(200).json(successResponse(result));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Login failed', 500));
  }
});

router.post('/dev-auto-login', async (_req, res, next) => {
  try {
    const result = await authenticateDevUser();
    return res.status(200).json(successResponse(result));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Development auto-login failed', 500));
  }
});

export default router;
