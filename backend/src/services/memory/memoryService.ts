import type { Memory, MemorySettings, MemoryType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../lib/logger';
import { validateMemoryContent } from './memoryValidator';
import { extractMemoriesFromTurn } from './memoryExtractor';
import { analyzeDeduplication } from './memoryDeduplicator';
import { rankMemoriesForPrompt } from './memoryRanker';

export type ListMemoriesOptions = {
  type?: MemoryType;
  isActive?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
};

/**
 * Retrieves or initializes default memory settings for a user.
 */
export async function getSettings(userId: string): Promise<MemorySettings> {
  const existing = await prisma.memorySettings.findUnique({
    where: { userId },
  });

  if (existing) return existing;

  return prisma.memorySettings.create({
    data: {
      userId,
      enabled: true,
      autoExtract: true,
      requireReview: false,
    },
  });
}

/**
 * Updates memory settings for a user.
 */
export async function updateSettings(
  userId: string,
  data: {
    enabled?: boolean;
    autoExtract?: boolean;
    requireReview?: boolean;
  },
): Promise<MemorySettings> {
  // Ensure settings record exists
  await getSettings(userId);

  return prisma.memorySettings.update({
    where: { userId },
    data: {
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.autoExtract !== undefined ? { autoExtract: data.autoExtract } : {}),
      ...(data.requireReview !== undefined ? { requireReview: data.requireReview } : {}),
    },
  });
}

/**
 * Lists user memories with optional filtering and pagination.
 */
export async function getMemories(
  userId: string,
  options: ListMemoriesOptions = {},
): Promise<{ memories: Memory[]; nextCursor?: string; total: number }> {
  const limit = Math.min(Math.max(1, options.limit || 20), 100);
  const whereClause: Record<string, unknown> = { userId };

  if (options.type) {
    whereClause.type = options.type;
  }
  if (options.isActive !== undefined) {
    whereClause.isActive = options.isActive;
  }
  if (options.search && options.search.trim().length > 0) {
    whereClause.OR = [
      { content: { contains: options.search.trim(), mode: 'insensitive' } },
      { summary: { contains: options.search.trim(), mode: 'insensitive' } },
    ];
  }

  const [total, memories] = await Promise.all([
    prisma.memory.count({ where: whereClause }),
    prisma.memory.findMany({
      where: whereClause,
      take: limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      orderBy: [{ isActive: 'desc' }, { importance: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  let nextCursor: string | undefined;
  if (memories.length > limit) {
    const nextItem = memories.pop();
    nextCursor = nextItem?.id;
  }

  return { memories, nextCursor, total };
}

/**
 * Retrieves a single memory by ID with strict user isolation (IDOR protection).
 */
export async function getMemoryById(userId: string, memoryId: string): Promise<Memory> {
  const memory = await prisma.memory.findFirst({
    where: { id: memoryId, userId },
  });

  if (!memory) {
    throw new AppError('Memory not found', 404);
  }

  return memory;
}

/**
 * Manually creates a new memory for a user.
 */
export async function createMemory(
  userId: string,
  data: {
    type: MemoryType;
    content: string;
    summary?: string;
    importance?: number;
    confidence?: number;
    sourceConversationId?: string;
    sourceMessageId?: string;
  },
): Promise<Memory> {
  const validation = validateMemoryContent(data.content);
  if (!validation.valid) {
    throw new AppError(validation.reason || 'Invalid memory content', 400);
  }

  const importance = data.importance ? Math.min(10, Math.max(1, data.importance)) : 5;
  const confidence = data.confidence ? Math.min(1.0, Math.max(0.1, data.confidence)) : 0.95;
  const summary = data.summary?.trim() || data.content.trim().slice(0, 60);

  // Check for conflicts or duplicates against existing active memories
  const existingActive = await prisma.memory.findMany({
    where: { userId, isActive: true },
  });

  const decision = analyzeDeduplication(existingActive, {
    type: data.type,
    content: data.content,
    summary,
    importance,
    confidence,
  });

  if (decision.action === 'DUPLICATE' && decision.targetMemory) {
    return prisma.memory.update({
      where: { id: decision.targetMemory.id },
      data: {
        confidence: decision.confidenceAdjustment || decision.targetMemory.confidence,
        lastAccessedAt: new Date(),
      },
    });
  }

  if (decision.action === 'SUPERSEDE' && decision.targetMemory) {
    await prisma.memory.update({
      where: { id: decision.targetMemory.id },
      data: { isActive: false },
    });
  }

  return prisma.memory.create({
    data: {
      userId,
      type: data.type,
      content: data.content.trim(),
      summary: summary.slice(0, 255),
      importance,
      confidence,
      sourceConversationId: data.sourceConversationId,
      sourceMessageId: data.sourceMessageId,
      isActive: true,
      lastAccessedAt: new Date(),
    },
  });
}

/**
 * Updates a memory by ID with strict user isolation.
 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  data: {
    content?: string;
    summary?: string;
    type?: MemoryType;
    importance?: number;
    isActive?: boolean;
  },
): Promise<Memory> {
  await getMemoryById(userId, memoryId); // Verifies ownership

  if (data.content !== undefined) {
    const validation = validateMemoryContent(data.content);
    if (!validation.valid) {
      throw new AppError(validation.reason || 'Invalid memory content', 400);
    }
  }

  return prisma.memory.update({
    where: { id: memoryId },
    data: {
      ...(data.content !== undefined ? { content: data.content.trim() } : {}),
      ...(data.summary !== undefined ? { summary: data.summary.trim().slice(0, 255) } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.importance !== undefined ? { importance: Math.min(10, Math.max(1, data.importance)) } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

/**
 * Deletes a memory by ID with strict user isolation.
 */
export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  await getMemoryById(userId, memoryId); // Verifies ownership

  await prisma.memory.delete({
    where: { id: memoryId },
  });
}

/**
 * Deletes all memories belonging to the authenticated user.
 */
export async function clearAllMemories(userId: string): Promise<{ count: number }> {
  const result = await prisma.memory.deleteMany({
    where: { userId },
  });
  return { count: result.count };
}

/**
 * Searches memories for the authenticated user.
 */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 20,
): Promise<Memory[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.memory.findMany({
    where: {
      userId,
      OR: [
        { content: { contains: trimmed, mode: 'insensitive' } },
        { summary: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: [{ isActive: 'desc' }, { importance: 'desc' }],
  });
}

/**
 * Retrieves and ranks relevant memories to inject into the LLM context.
 */
export async function getRelevantMemoriesForPrompt(
  userId: string,
  prompt: string,
  recentContext = '',
): Promise<Memory[]> {
  const settings = await getSettings(userId);
  if (!settings.enabled) {
    return [];
  }

  const activeMemories = await prisma.memory.findMany({
    where: { userId, isActive: true },
  });

  if (activeMemories.length === 0) return [];

  const ranked = rankMemoriesForPrompt(activeMemories, prompt, recentContext, 5);

  // Update lastAccessedAt for ranked memories in the background
  if (ranked.length > 0) {
    const memoryIds = ranked.map((m) => m.id);
    prisma.memory
      .updateMany({
        where: { id: { in: memoryIds } },
        data: { lastAccessedAt: new Date() },
      })
      .catch((err) => {
        logger.warn('Failed to update memory lastAccessedAt', { error: err });
      });
  }

  return ranked;
}

/**
 * Processes a completed conversation turn to detect and extract long-term memories.
 * Designed to run asynchronously in the background.
 */
export async function processTurnForMemories(
  userId: string,
  conversationId: string,
  messageId: string,
  userText: string,
  assistantText?: string,
): Promise<void> {
  try {
    const settings = await getSettings(userId);
    if (!settings.enabled || !settings.autoExtract) {
      return;
    }

    const candidates = await extractMemoriesFromTurn(userText, assistantText);
    if (candidates.length === 0) return;

    const existingMemories = await prisma.memory.findMany({
      where: { userId, isActive: true },
    });

    for (const candidate of candidates) {
      const decision = analyzeDeduplication(existingMemories, candidate);

      if (decision.action === 'DUPLICATE' && decision.targetMemory) {
        await prisma.memory.update({
          where: { id: decision.targetMemory.id },
          data: {
            confidence: decision.confidenceAdjustment || decision.targetMemory.confidence,
            lastAccessedAt: new Date(),
          },
        });
        logger.info('Duplicate memory updated confidence', { id: decision.targetMemory.id });
      } else if (decision.action === 'SUPERSEDE' && decision.targetMemory) {
        await prisma.memory.update({
          where: { id: decision.targetMemory.id },
          data: { isActive: false },
        });

        const newMemory = await prisma.memory.create({
          data: {
            userId,
            type: candidate.type,
            content: candidate.content,
            summary: candidate.summary,
            importance: candidate.importance,
            confidence: candidate.confidence,
            sourceConversationId: conversationId,
            sourceMessageId: messageId,
            isActive: !settings.requireReview,
            lastAccessedAt: new Date(),
          },
        });
        logger.info('Superseded old memory with updated memory', {
          oldId: decision.targetMemory.id,
          newId: newMemory.id,
        });
      } else {
        const newMemory = await prisma.memory.create({
          data: {
            userId,
            type: candidate.type,
            content: candidate.content,
            summary: candidate.summary,
            importance: candidate.importance,
            confidence: candidate.confidence,
            sourceConversationId: conversationId,
            sourceMessageId: messageId,
            isActive: !settings.requireReview,
            lastAccessedAt: new Date(),
          },
        });
        logger.info('Extracted and saved new long-term memory', {
          id: newMemory.id,
          type: newMemory.type,
          summary: newMemory.summary,
        });
      }
    }
  } catch (error) {
    logger.error('Failed to process turn for memories', { error, userId, conversationId });
  }
}

