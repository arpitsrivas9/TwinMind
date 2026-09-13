import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { requireTrustMode } from '../middleware/trustAuth';
import { errorResponse, successResponse } from '../utils/apiResponse';
import * as memoryService from '../services/memory/memoryService';
import { env } from '../config/env';

const router = Router();
const cuidSchema = z.string().cuid();

const memoryTypeSchema = z.enum([
  'USER_PREFERENCE',
  'GOAL',
  'PROJECT',
  'EPISODIC',
  'SEMANTIC',
  'CONVERSATION',
]);

const createMemorySchema = z.object({
  type: memoryTypeSchema,
  content: z.string().trim().min(3).max(2000),
  summary: z.string().trim().max(255).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  confidence: z.number().min(0.1).max(1.0).optional(),
});

const updateMemorySchema = z.object({
  type: memoryTypeSchema.optional(),
  content: z.string().trim().min(3).max(2000).optional(),
  summary: z.string().trim().max(255).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  autoExtract: z.boolean().optional(),
  requireReview: z.boolean().optional(),
});

const memoryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    return authenticatedRequest.user?.id || req.ip || 'unknown';
  },
  message: {
    success: false,
    error: 'Too many memory requests, please try again later.',
  },
  skip: () => env.nodeEnv === 'development' || env.nodeEnv === 'test',
});

router.use(requireAuth, requireTrustMode('OWNER'));

// GET /api/memories/settings
router.get('/settings', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const settings = await memoryService.getSettings(req.user!.id);
    return res.json(successResponse(settings));
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/memories/settings
router.patch('/settings', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
  }

  try {
    const settings = await memoryService.updateSettings(req.user!.id, parsed.data);
    return res.json(successResponse(settings));
  } catch (error) {
    return next(error);
  }
});

// GET /api/memories/search?q=...
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q : '';
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  try {
    const results = await memoryService.searchMemories(req.user!.id, query, limit);
    return res.json(successResponse(results));
  } catch (error) {
    return next(error);
  }
});

// GET /api/memories
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;
  const isActiveParam = typeof req.query.isActive === 'string' ? req.query.isActive === 'true' : undefined;
  const searchParam = typeof req.query.search === 'string' ? req.query.search : undefined;
  const cursorParam = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const limitParam = req.query.limit ? Number(req.query.limit) : undefined;

  let validatedType: z.infer<typeof memoryTypeSchema> | undefined;
  if (typeParam) {
    const parseType = memoryTypeSchema.safeParse(typeParam);
    if (!parseType.success) {
      return res.status(400).json(errorResponse('Invalid memory type filter'));
    }
    validatedType = parseType.data;
  }

  try {
    const result = await memoryService.getMemories(req.user!.id, {
      type: validatedType,
      isActive: isActiveParam,
      search: searchParam,
      cursor: cursorParam,
      limit: limitParam,
    });
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
});

// POST /api/memories
router.post('/', requireAuth, memoryLimiter, async (req: AuthenticatedRequest, res, next) => {
  const parsed = createMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
  }

  try {
    const memory = await memoryService.createMemory(req.user!.id, parsed.data);
    return res.status(201).json(successResponse(memory));
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/memories (clear all memories)
router.delete('/', requireAuth, memoryLimiter, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await memoryService.clearAllMemories(req.user!.id);
    return res.json(successResponse(result));
  } catch (error) {
    return next(error);
  }
});

// GET /api/memories/:id
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsedId = cuidSchema.safeParse(rawId);
  if (!parsedId.success) {
    return res.status(400).json(errorResponse('Invalid memory id'));
  }

  try {
    const memory = await memoryService.getMemoryById(req.user!.id, parsedId.data);
    return res.json(successResponse(memory));
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/memories/:id
router.patch('/:id', requireAuth, memoryLimiter, async (req: AuthenticatedRequest, res, next) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsedId = cuidSchema.safeParse(rawId);
  if (!parsedId.success) {
    return res.status(400).json(errorResponse('Invalid memory id'));
  }

  const parsed = updateMemorySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
  }

  try {
    const updated = await memoryService.updateMemory(req.user!.id, parsedId.data, parsed.data);
    return res.json(successResponse(updated));
  } catch (error) {
    return next(error);
  }
});

// DELETE /api/memories/:id
router.delete('/:id', requireAuth, memoryLimiter, async (req: AuthenticatedRequest, res, next) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsedId = cuidSchema.safeParse(rawId);
  if (!parsedId.success) {
    return res.status(400).json(errorResponse('Invalid memory id'));
  }

  try {
    await memoryService.deleteMemory(req.user!.id, parsedId.data);
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
