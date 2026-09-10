import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { searchUserKnowledge } from '../services/search/hybridSearchService';

const router = Router();
const searchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().positive().max(20).optional(),
});

router.use(requireAuth);

// GET /api/search?q=... - Quick query parameter search
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : '';
    if (!q) {
      return res.status(400).json(errorResponse('Query parameter "q" is required and cannot be empty'));
    }

    const topK = req.query.topK ? parseInt(String(req.query.topK), 10) : undefined;
    const results = await searchUserKnowledge(req.user!.id, q, { topK });

    return res.status(200).json(
      successResponse({
        query: q,
        count: results.length,
        results,
      }),
    );
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to execute knowledge search', 500));
  }
});

// POST /api/search - Standalone TwinSearch™ query
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const results = await searchUserKnowledge(req.user!.id, parsed.data.query, {
      topK: parsed.data.topK,
    });

    return res.status(200).json(
      successResponse({
        query: parsed.data.query,
        count: results.length,
        results,
      }),
    );
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to execute knowledge search', 500));
  }
});

export default router;
