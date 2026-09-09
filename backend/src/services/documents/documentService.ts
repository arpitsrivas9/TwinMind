import crypto from 'crypto';
import path from 'path';
import type { Document, DocumentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/errorHandler';
import { getStorageProvider } from '../storage/storageService';
import { getEmbeddingProvider } from '../embeddings/embeddingService';
import { getVectorStore } from '../vector/vectorStore';
import { getGraphIngestionService } from '../graph/graphIngestionService';
import { chunkSections } from './chunker';
import { PdfProcessor } from './processors/pdfProcessor';
import { DocxProcessor } from './processors/docxProcessor';
import { PptxProcessor } from './processors/pptxProcessor';
import { OcrProcessor } from './processors/ocrProcessor';
import { VideoProcessor } from './processors/videoProcessor';
import { TextProcessor } from './processors/textProcessor';
import type { IDocumentProcessor, ExtractionResult } from './processors/types';

const processors: IDocumentProcessor[] = [
  new PdfProcessor(),
  new DocxProcessor(),
  new PptxProcessor(),
  new OcrProcessor(),
  new VideoProcessor(),
  new TextProcessor(),
];

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.pptx',
  '.ppt',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
  '.mp3',
  '.wav',
  '.txt',
  '.md',
  '.csv',
  '.json',
]);

function sanitizeFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${base.slice(0, 80)}${ext}`;
}

export function validateUpload(file: Express.Multer.File) {
  if (!file || !file.buffer) {
    throw new AppError('No file provided for upload', 400);
  }

  if (file.size > env.maxFileSize) {
    throw new AppError(`File size exceeds maximum allowed size of ${Math.round(env.maxFileSize / (1024 * 1024))}MB`, 400);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(`Unsupported file extension '${ext}'. Supported formats: PDF, DOCX, PPTX, PNG, JPG, WEBP, MP4, WEBM, MOV, TXT, MD`, 400);
  }
}

export async function uploadDocument(
  userId: string,
  file: Express.Multer.File,
): Promise<Document> {
  validateUpload(file);

  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // Idempotency: Check if this user already uploaded an identical file
  const existing = await prisma.document.findFirst({
    where: { userId, checksum, status: { not: 'FAILED' } },
  });

  if (existing) {
    logger.info('Duplicate file detected for user; returning existing document', {
      userId,
      documentId: existing.id,
      filename: file.originalname,
    });
    return existing;
  }

  const sanitized = sanitizeFilename(file.originalname);
  const storageKey = `${userId}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${sanitized}`;

  const storage = getStorageProvider();
  await storage.saveFile(storageKey, file.buffer, file.mimetype);

  const document = await prisma.document.create({
    data: {
      userId,
      filename: sanitized,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storageKey,
      status: 'UPLOADED',
      checksum,
    },
  });

  logger.info('Document uploaded successfully; scheduling background processing', {
    documentId: document.id,
    userId,
    filename: sanitized,
  });

  // Trigger background extraction, chunking, and embedding
  processDocument(document.id).catch((err) => {
    logger.error('Background document processing error', { documentId: document.id, error: err });
  });

  return document;
}

export async function processDocument(documentId: string): Promise<void> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    logger.warn('Cannot process non-existent document', { documentId });
    return;
  }

  logger.info('Starting document processing pipeline', { documentId, filename: document.filename });

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PROCESSING', processingError: null },
  });

  try {
    const storage = getStorageProvider();
    const buffer = await storage.getFile(document.storageKey);

    // 1. Route to matching processor
    const processor = processors.find((p) => p.canProcess(document.mimeType, document.filename));
    if (!processor) {
      throw new Error(`No compatible processor found for format ${document.mimeType}`);
    }

    const extraction: ExtractionResult = await processor.process(buffer, document.filename);
    if (!extraction.text.trim()) {
      throw new Error('No readable text content could be extracted from this document');
    }

    // 2. Semantic Chunking
    const chunkCandidates = chunkSections(extraction.sections, {
      chunkSize: env.chunkSize,
      chunkOverlap: env.chunkOverlap,
    });

    if (chunkCandidates.length === 0) {
      throw new Error('Text was extracted but produced zero valid chunks');
    }

    // 3. Generate Vector Embeddings
    const embeddingProvider = getEmbeddingProvider();
    const chunkTexts = chunkCandidates.map((c) => c.content);
    const embeddings = await embeddingProvider.generateEmbeddings(chunkTexts);

    // 4. Persistence Transaction
    await prisma.$transaction(async (tx) => {
      // Clean up previous chunks if reprocessing
      await tx.documentChunk.deleteMany({
        where: { documentId },
      });

      for (let i = 0; i < chunkCandidates.length; i++) {
        const c = chunkCandidates[i];
        const vector = embeddings[i] || [];

        await tx.documentChunk.create({
          data: {
            documentId,
            userId: document.userId,
            chunkIndex: c.chunkIndex,
            content: c.content,
            pageNumber: c.pageNumber,
            slideNumber: c.slideNumber,
            timestamp: c.timestamp,
            sectionTitle: c.sectionTitle,
            tokenCount: c.tokenCount,
            embedding: vector,
          },
        });
      }

      await tx.document.update({
        where: { id: documentId },
        data: {
          status: 'READY',
          pageCount: extraction.pageCount || 1,
          processedAt: new Date(),
          processingError: null,
        },
      });
    });

    // 5. Index into Vector Store
    const vectorStore = getVectorStore();
    const createdChunks = await prisma.documentChunk.findMany({
      where: { documentId },
      select: { id: true, embedding: true, pageNumber: true, slideNumber: true, timestamp: true, sectionTitle: true },
    });

    await vectorStore.upsert(
      createdChunks.map((c) => ({
        id: c.id,
        documentId,
        userId: document.userId,
        vector: c.embedding,
        metadata: {
          pageNumber: c.pageNumber,
          slideNumber: c.slideNumber,
          timestamp: c.timestamp,
          sectionTitle: c.sectionTitle,
        },
      })),
    );

    logger.info('Document processing completed successfully', {
      documentId,
      totalChunks: chunkCandidates.length,
      pageCount: extraction.pageCount,
    });

    // 6. Ingest into TwinGraph™
    getGraphIngestionService()
      .ingestFromDocument(
        document.userId,
        documentId,
        document.originalFilename || document.filename,
        extraction.text,
      )
      .catch((err) => {
        logger.warn('Failed to ingest document into TwinGraph', { documentId, error: err });
      });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown processing failure';
    logger.error('Document processing failed', { documentId, error });

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: 'FAILED',
        processingError: message.slice(0, 500),
      },
    });
  }
}

export async function listDocuments(
  userId: string,
  options: { page?: number; limit?: number; status?: DocumentStatus } = {},
): Promise<{ documents: Document[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(Math.max(1, options.limit || 20), 100);
  const skip = (page - 1) * limit;

  const whereClause = {
    userId,
    ...(options.status ? { status: options.status } : {}),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: { select: { chunks: true } },
      },
    }),
    prisma.document.count({ where: whereClause }),
  ]);

  return {
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getDocument(userId: string, documentId: string): Promise<any> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
    include: {
      _count: { select: { chunks: true } },
      chunks: {
        select: {
          id: true,
          chunkIndex: true,
          content: true,
          pageNumber: true,
          slideNumber: true,
          timestamp: true,
          sectionTitle: true,
        },
        orderBy: { chunkIndex: 'asc' },
      },
    },
  });

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  return document;
}

export async function deleteDocument(userId: string, documentId: string): Promise<void> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
  });

  if (!document) {
    throw new AppError('Document not found', 404);
  }

  // 1. Delete physical file from storage
  const storage = getStorageProvider();
  await storage.deleteFile(document.storageKey).catch((err) => {
    logger.warn('Failed to delete physical file from storage', { key: document.storageKey, error: err });
  });

  // 2. Delete vectors from vector store
  const vectorStore = getVectorStore();
  await vectorStore.deleteByDocument(documentId, userId).catch((err) => {
    logger.warn('Failed to delete vectors from vector store', { documentId, error: err });
  });

  // 3. Delete relational document (cascades to chunks and citations)
  await prisma.document.delete({
    where: { id: documentId },
  });

  // 4. Clean up graph relationships and entity
  await getGraphIngestionService()
    .handleSourceDeletion(userId, 'DOCUMENT', documentId)
    .catch((err) => {
      logger.warn('Failed to clean up graph on document deletion', { documentId, error: err });
    });

  logger.info('Document deleted successfully', { documentId, userId });
}

export async function reprocessDocument(userId: string, documentId: string): Promise<Document> {
  const document = await getDocument(userId, documentId);

  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'PROCESSING', processingError: null },
  });

  processDocument(documentId).catch((err) => {
    logger.error('Reprocess document failure', { documentId, error: err });
  });

  return document;
}

