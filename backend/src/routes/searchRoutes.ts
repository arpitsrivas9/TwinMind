import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { searchUserKnowledge } from '../services/search/hybridSearchService';
import { resolveConversationLanguage } from '../services/promptService';

const router = Router();
const searchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().positive().max(20).optional(),
});

router.use(requireAuth);

async function executeSearch(userId: string, query: string, topK?: number) {
  const results = await searchUserKnowledge(userId, query, { topK });
  const resolvedLang = resolveConversationLanguage(query);
  return {
    query,
    resolvedLanguage: resolvedLang.language,
    count: results.length,
    results,
  };
}

// POST /api/search - Standalone TwinSearch™ query
router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const payload = await executeSearch(req.user!.id, parsed.data.query, parsed.data.topK);
    return res.status(200).json(successResponse(payload));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to execute knowledge search', 500));
  }
});

// GET /api/search?q=... - Query string search endpoint
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const topKParam = req.query.topK ? Number(req.query.topK) : undefined;
    const parsed = searchSchema.safeParse({ query: q, topK: topKParam });
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const payload = await executeSearch(req.user!.id, parsed.data.query, parsed.data.topK);
    return res.status(200).json(successResponse(payload));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to execute knowledge search', 500));
  }
});

export default router;

