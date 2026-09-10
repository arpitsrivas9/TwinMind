import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { DocumentStatus } from '@prisma/client';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { successResponse, errorResponse } from '../utils/apiResponse';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
  reprocessDocument,
} from '../services/documents/documentService';
import { env } from '../config/env';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileSize },
});

const idSchema = z.string().cuid();
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  status: z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']).optional(),
});

router.use(requireAuth);

// POST /api/documents (and alias /upload) - Upload a document or media file
const handleUpload = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorResponse('No file provided in form field "file"'));
    }

    const document = await uploadDocument(req.user!.id, req.file);
    return res.status(201).json(successResponse(document));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to upload document', 500));
  }
};

router.post('/', upload.single('file'), handleUpload);
router.post('/upload', upload.single('file'), handleUpload);

// GET /api/documents - List documents
router.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Invalid query parameters', { issues: parsed.error.issues }));
    }

    const result = await listDocuments(req.user!.id, {
      page: parsed.data.page,
      limit: parsed.data.limit,
      status: parsed.data.status as DocumentStatus | undefined,
    });

    return res.status(200).json(successResponse(result));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to list documents', 500));
  }
});

// GET /api/documents/:id - Get document details
router.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json(errorResponse('Invalid document id'));
    }

    const document = await getDocument(req.user!.id, parsedId.data);
    return res.status(200).json(successResponse(document));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to retrieve document', 500));
  }
});

// DELETE /api/documents/:id - Delete document
router.delete('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json(errorResponse('Invalid document id'));
    }

    await deleteDocument(req.user!.id, parsedId.data);
    return res.status(200).json(successResponse({ deleted: true }));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to delete document', 500));
  }
});

// POST /api/documents/:id/reprocess - Reprocess failed document
router.post('/:id/reprocess', async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsedId = idSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      return res.status(400).json(errorResponse('Invalid document id'));
    }

    const document = await reprocessDocument(req.user!.id, parsedId.data);
    return res.status(200).json(successResponse(document));
  } catch (error) {
    return next(error instanceof AppError ? error : new AppError('Unable to reprocess document', 500));
  }
});

export default router;

