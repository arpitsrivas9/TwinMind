import { Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  renameConversation,
  searchConversations,
} from '../services/conversationService';
import { errorResponse, successResponse } from '../utils/apiResponse';

const router = Router();
const idSchema = z.string().cuid();
const titleSchema = z.object({ title: z.string().trim().min(1).max(160) });
const createSchema = z.object({ title: z.string().trim().min(1).max(160).optional() });
const searchSchema = z.object({ q: z.string().trim().max(120).default('') });

const parseId = (value: string) => {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new AppError('Invalid conversation id', 400);
  return parsed.data;
};

const routeId = (value: string | string[]) => parseId(Array.isArray(value) ? value[0] : value);

router.use(requireAuth);

router.get('/search', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));

    const conversations = await searchConversations(req.user!.id, parsed.data.q);
    return res.status(200).json(successResponse(conversations));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to search conversations', 500));
  }
});

router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const conversations = await listConversations(req.user!.id);
    return res.status(200).json(successResponse(conversations));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to list conversations', 500));
  }
});

router.post('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));

    const conversation = await createConversation(req.user!.id, parsed.data.title);
    return res.status(201).json(successResponse(conversation));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to create conversation', 500));
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const conversation = await getConversation(req.user!.id, routeId(req.params.id));
    return res.status(200).json(successResponse(conversation));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to fetch conversation', 500));
  }
});

router.patch('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = titleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));

    const conversation = await renameConversation(req.user!.id, routeId(req.params.id), parsed.data.title);
    return res.status(200).json(successResponse(conversation));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to rename conversation', 500));
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    await deleteConversation(req.user!.id, routeId(req.params.id));
    return res.status(204).send();
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to delete conversation', 500));
  }
});

router.get('/:id/messages', async (req: AuthenticatedRequest, res, next) => {
  try {
    const messages = await listMessages(req.user!.id, routeId(req.params.id));
    return res.status(200).json(successResponse(messages));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to list messages', 500));
  }
});

export default router;
