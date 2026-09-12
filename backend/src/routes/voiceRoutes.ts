import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { successResponse, errorResponse } from '../utils/apiResponse';
import { detectVoiceIntent, transcribeAudioBuffer } from '../services/voiceService';
import { env } from '../config/env';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB audio
});

const handleAudioUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single('audio')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(errorResponse('Audio file exceeds the 15MB limit'));
      }
      return res.status(400).json(errorResponse(err.message));
    } else if (err) {
      return res.status(400).json(errorResponse('Failed to parse audio upload'));
    }
    next();
  });
};

const intentSchema = z.object({
  utterance: z.string().trim().min(1).max(5000),
});

/**
 * GET /api/voice/config
 * Returns current voice configuration, supported wake words, and provider availability.
 */
router.get('/config', (_req: Request, res: Response) => {
  return res.status(200).json(
    successResponse({
      wakeWord: 'Hey TwinMind',
      wakeWordVariants: ['Hey TwinMind', 'TwinMind', 'Okay TwinMind', 'Hi TwinMind'],
      localWakeWordSupported: true,
      streamingTtsSupported: true,
      serverTranscriptionAvailable: Boolean(env.geminiApiKey || env.openAiApiKey),
      defaultModel: env.geminiModel,
    }),
  );
});

/**
 * POST /api/voice/intent
 * Fast server-side voice intent classification.
 */
router.post('/intent', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
  }

  const result = detectVoiceIntent(parsed.data.utterance);
  return res.status(200).json(successResponse(result));
});

/**
 * POST /api/voice/transcribe
 * Fallback server-side audio transcription via Gemini Multimodal or Whisper.
 */
router.post('/transcribe', requireAuth, handleAudioUpload, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('Audio file is required under "audio" field'));
    }

    const mimeType = req.file.mimetype || 'audio/webm';
    const result = await transcribeAudioBuffer(req.file.buffer, mimeType);

    return res.status(200).json(successResponse(result));
  } catch (err) {
    next(err);
  }
});

export default router;

