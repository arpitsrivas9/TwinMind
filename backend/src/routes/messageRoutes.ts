import { Router } from 'express';
import type { Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { streamAssistantResponse } from '../services/aiService';
import {
  createAssistantMessage,
  createUserMessage,
  getContextMessages,
} from '../services/conversationService';
import { getModel } from '../services/modelRegistry';
import { errorResponse } from '../utils/apiResponse';

import { fitMessagesToBudget } from '../services/promptService';
import {
  getRelevantMemoriesForPrompt,
  processTurnForMemories,
} from '../services/memory/memoryService';
import { logger } from '../lib/logger';

const router = Router({ mergeParams: true });
const idSchema = z.string().cuid();
const messageSchema = z.object({
  content: z.string().trim().min(1).max(env.aiMaxInputCharacters),
  model: z.string().trim().min(1).max(120),
});

const aiLimiter = rateLimit({
  windowMs: env.aiRequestWindowMs,
  max: env.aiRequestLimit,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const authenticatedRequest = req as AuthenticatedRequest;
    return authenticatedRequest.user?.id || req.ip || 'unknown';
  },
  message: 'Too many AI requests, please try again later.',
});

const sendEvent = (res: Response, event: string, data: unknown) => {
  if (!res.writableEnded) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
};

router.post('/', requireAuth, aiLimiter, async (req: AuthenticatedRequest, res, next) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsedId = idSchema.safeParse(rawId);
  if (!parsedId.success) {
    return res.status(400).json(errorResponse('Invalid conversation id'));
  }
  const conversationId = parsedId.data;

  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
  }

  let userMessage: Awaited<ReturnType<typeof createUserMessage>> | undefined;
  const modelId = parsed.data.model;
  const abortController = new AbortController();
  let clientDisconnected = false;

  const onClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort();
    }
  };
  req.on('close', onClose);

  try {
    const model = getModel(modelId);
    if (parsed.data.content.length > model.maxInputCharacters) {
      throw new AppError('Message is too long for the selected model', 400);
    }

    userMessage = await createUserMessage(req.user!.id, conversationId, parsed.data.content);
    const rawContextMessages = await getContextMessages(req.user!.id, conversationId, env.aiContextMessageLimit);
    // Apply character/token budget to context messages
    const contextMessages = fitMessagesToBudget(rawContextMessages, model.maxInputCharacters * 2);

    // Fetch relevant durable memories for this turn
    const recentSummary = contextMessages.slice(-3).map((m) => m.content).join(' ');
    const relevantMemories = await getRelevantMemoriesForPrompt(
      req.user!.id,
      parsed.data.content,
      recentSummary,
    );

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sendEvent(res, 'message_started', { userMessage, model: modelId });

    let content = '';
    for await (const delta of streamAssistantResponse({
      model: modelId,
      messages: contextMessages,
      memories: relevantMemories,
      signal: abortController.signal,
    })) {
      if (clientDisconnected) break;
      content += delta;
      sendEvent(res, 'delta', { text: delta });
    }

    if (clientDisconnected) {
      return;
    }

    if (!content.trim()) throw new AppError('The AI provider returned an empty response', 502);

    const assistantMessage = await createAssistantMessage(req.user!.id, conversationId, content, modelId);
    sendEvent(res, 'message_completed', { message: assistantMessage });
    res.end();

    // Trigger background memory candidate detection and extraction asynchronously
    processTurnForMemories(
      req.user!.id,
      conversationId,
      userMessage.id,
      parsed.data.content,
      content,
    ).catch((err) => {
      logger.warn('Background memory extraction error', { error: err });
    });
  } catch (error) {
    if (clientDisconnected) {
      return;
    }

    const appError = error instanceof AppError ? error : new AppError('Unable to generate an AI response', 502);

    if (!res.headersSent) return next(appError);

    if (userMessage) {
      try {
        await createAssistantMessage(req.user!.id, conversationId, 'TwinMind could not complete this response.', modelId, 'FAILED');
      } catch {
        // Preserve the original stream error without leaking persistence details.
      }
    }

    sendEvent(res, 'error', { message: appError.message });
    res.end();
  } finally {
    req.off('close', onClose);
  }
});

export default router;
