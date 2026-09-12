import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
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

import multer from 'multer';
import { fitMessagesToBudget, resolveConversationLanguage } from '../services/promptService';
import type { AttachmentContext } from '../services/promptService';
import {
  getRelevantMemoriesForPrompt,
  processTurnForMemories,
} from '../services/memory/memoryService';
import {
  retrieveGraphAwareKnowledgeForPrompt,
  saveMessageCitations,
} from '../services/rag/ragService';
import { getGraphIngestionService } from '../services/graph/graphIngestionService';
import { PdfProcessor } from '../services/documents/processors/pdfProcessor';
import { logger } from '../lib/logger';

const router = Router({ mergeParams: true });
const idSchema = z.string().cuid();
const messageSchema = z.object({
  content: z.string().max(env.aiMaxInputCharacters).optional().default(''),
  model: z.string().trim().min(1).max(120),
  language: z.enum(['auto', 'en', 'hi', 'hinglish']).optional().default('auto'),
  speakingStyle: z.enum(['conversational', 'professional', 'concise', 'friendly']).optional().default('conversational'),
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'text/csv',
  'application/csv',
  'text/x-csv',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(errorResponse('File size exceeds the 10MB limit'));
      }
      return res.status(400).json(errorResponse(err.message));
    } else if (err) {
      return res.status(400).json(errorResponse('Failed to process file upload'));
    }
    next();
  });
};

async function processFile(file: Express.Multer.File): Promise<AttachmentContext> {
  const dotIndex = file.originalname.lastIndexOf('.');
  const ext = dotIndex !== -1 ? file.originalname.slice(dotIndex).toLowerCase() : '';
  const mime = file.mimetype.toLowerCase();

  const isAllowed = ALLOWED_MIME_TYPES.has(mime) || ALLOWED_EXTENSIONS.has(ext);
  if (!isAllowed) {
    throw new AppError(
      'Unsupported file format. Supported formats: PDF, TXT, MD, JSON, CSV, PNG, JPG, JPEG, WebP.',
      400,
    );
  }

  let text: string | undefined;
  let base64: string | undefined;

  if (mime.startsWith('image/')) {
    base64 = file.buffer.toString('base64');
  } else if (mime === 'application/pdf' || ext === '.pdf') {
    const pdfProcessor = new PdfProcessor();
    const result = await pdfProcessor.process(file.buffer, file.originalname);
    text = result.text;
    base64 = file.buffer.toString('base64');
  } else {
    // Text-based files
    text = file.buffer.toString('utf-8');
  }

  return {
    filename: file.originalname,
    mimeType: mime || 'application/octet-stream',
    size: file.size,
    text,
    base64,
  };
}

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

router.post('/', requireAuth, aiLimiter, handleUpload, async (req: AuthenticatedRequest, res, next) => {
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

  let attachment: AttachmentContext | undefined;
  if (req.file) {
    try {
      attachment = await processFile(req.file);
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json(errorResponse(err.message));
      }
      return res.status(400).json(errorResponse('Failed to parse uploaded file'));
    }
  }

  const promptContent = parsed.data.content.trim() || (attachment ? 'Analyze the attached file' : '');
  if (!promptContent && !attachment) {
    return res.status(400).json(errorResponse('Message content or an attachment is required'));
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
    if (promptContent.length > model.maxInputCharacters) {
      throw new AppError('Message is too long for the selected model', 400);
    }

    const storedContent = attachment
      ? `[Attachment: ${attachment.filename}]\n\n${promptContent}`
      : promptContent;

    userMessage = await createUserMessage(req.user!.id, conversationId, storedContent);
    const rawContextMessages = await getContextMessages(req.user!.id, conversationId, env.aiContextMessageLimit);
    // Apply character/token budget to context messages
    const contextMessages = fitMessagesToBudget(rawContextMessages, model.maxInputCharacters * 2);

    // Fetch relevant durable memories for this turn
    const recentSummary = contextMessages.slice(-3).map((m) => m.content).join(' ');
    const relevantMemories = await getRelevantMemoriesForPrompt(
      req.user!.id,
      promptContent,
      recentSummary,
    );

    // Fetch relevant private documents & graph context (Phase 4 & Phase 5 TwinGraph™)
    const knowledge = await retrieveGraphAwareKnowledgeForPrompt(
      req.user!.id,
      promptContent,
      env.ragTopK,
    );
    const relevantDocuments = knowledge.documents;
    const graphRelationships = knowledge.graphRelationships;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Resolve conversational language & script prior to generation
    const resolvedLang = resolveConversationLanguage(
      promptContent,
      contextMessages,
      parsed.data.language,
    );

    sendEvent(res, 'message_started', {
      userMessage,
      model: modelId,
      resolvedLanguage: resolvedLang.language,
      resolvedScript: resolvedLang.script,
    });

    if (relevantDocuments.length > 0) {
      sendEvent(res, 'citations', {
        citations: relevantDocuments.map((doc) => ({
          documentId: doc.documentId,
          chunkId: doc.chunkId,
          documentTitle: doc.documentTitle,
          filename: doc.filename,
          pageNumber: doc.pageNumber,
          slideNumber: doc.slideNumber,
          timestamp: doc.timestamp,
          snippet: doc.content.slice(0, 300),
          score: doc.score,
        })),
      });
    }

    let content = '';
    for await (const delta of streamAssistantResponse({
      model: modelId,
      messages: contextMessages,
      memories: relevantMemories,
      documents: relevantDocuments,
      graphRelationships,
      attachment,
      language: parsed.data.language,
      speakingStyle: parsed.data.speakingStyle,
      resolvedLanguage: resolvedLang.language,
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
    if (relevantDocuments.length > 0) {
      await saveMessageCitations(assistantMessage.id, relevantDocuments);
    }

    sendEvent(res, 'message_completed', {
      message: {
        ...assistantMessage,
        citations: relevantDocuments.map((doc) => ({
          documentId: doc.documentId,
          chunkId: doc.chunkId,
          documentTitle: doc.documentTitle,
          filename: doc.filename,
          pageNumber: doc.pageNumber,
          slideNumber: doc.slideNumber,
          timestamp: doc.timestamp,
          snippet: doc.content.slice(0, 300),
          score: doc.score,
        })),
      },
    });
    res.end();

    // Trigger background memory candidate detection and extraction asynchronously
    processTurnForMemories(
      req.user!.id,
      conversationId,
      userMessage.id,
      promptContent,
      content,
    ).catch((err) => {
      logger.warn('Background memory extraction error', { error: err });
    });

    // Trigger background graph entity & relationship ingestion asynchronously (Phase 5)
    getGraphIngestionService()
      .ingestFromMessage(req.user!.id, userMessage.id, promptContent, conversationId)
      .catch((err) => {
        logger.warn('Background graph ingestion error', { error: err });
      });
  } catch (error) {
    if (clientDisconnected) {
      return;
    }

    const appError = error instanceof AppError ? error : new AppError('Unable to generate an AI response', 502);
    logger.error('Stream assistant error occurred', {
      error: error instanceof Error ? error.message : String(error),
      statusCode: appError.statusCode,
      model: modelId,
      conversationId,
    });

    if (!res.headersSent) return next(appError);

    let failedMessage: unknown = undefined;
    if (userMessage) {
      try {
        const failureReason = appError.statusCode === 429
          ? 'TwinMind could not complete this response: Provider rate limit or quota exceeded. Please switch models or try again shortly.'
          : `TwinMind could not complete this response: ${appError.message}`;

        failedMessage = await createAssistantMessage(
          req.user!.id,
          conversationId,
          failureReason,
          modelId,
          'FAILED',
        );
      } catch (saveErr) {
        logger.warn('Failed to persist failed assistant message', { error: saveErr });
      }
    }

    sendEvent(res, 'error', {
      message: appError.message,
      failedMessage,
    });
    res.end();
  } finally {
    req.off('close', onClose);
  }
});

export default router;
