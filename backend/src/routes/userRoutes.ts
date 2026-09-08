import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserById, updateUserProfile } from '../services/authService';
import { errorResponse, successResponse } from '../utils/apiResponse';

const router = Router();

const profileSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  avatarUrl: z.string().url().optional().nullable(),
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getUserById(req.user!.id);
    return res.status(200).json(successResponse(user));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to fetch profile', 500));
  }
});

router.patch('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const user = await updateUserProfile(
      req.user!.id,
      parsed.data.name ?? req.user!.name,
      parsed.data.avatarUrl,
    );

    return res.status(200).json(successResponse(user));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Profile update failed', 500));
  }
});

export default router;
