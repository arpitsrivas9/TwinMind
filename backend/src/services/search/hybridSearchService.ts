import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { getEmbeddingProvider } from '../embeddings/embeddingService';
import { getVectorStore } from '../vector/vectorStore';
import { logger } from '../../lib/logger';

export type SearchResultItem = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  content: string;
  pageNumber?: number;
  slideNumber?: number;
  timestamp?: string;
  sectionTitle?: string;
  score: number;
};

export type HybridSearchOptions = {
  topK?: number;
  threshold?: number;
  semanticWeight?: number; // default 0.7
  keywordWeight?: number; // default 0.3
};

/**
 * Tokenizes text into search terms, removing common stopwords.
 */
function extractSearchTokens(text: string): string[] {
  const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'were', 'will', 'with', 'what', 'where', 'when', 'how',
    'my', 'i', 'our', 'we', 'your', 'you', 'does', 'say', 'about',
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopwords.has(token));
}

/**
 * Executes hybrid semantic + keyword search over user's knowledge base.
 */
export async function searchUserKnowledge(
  userId: string,
  query: string,
  options: HybridSearchOptions = {},
): Promise<SearchResultItem[]> {
  const topK = options.topK || env.ragTopK;
  const threshold = options.threshold !== undefined ? options.threshold : env.ragSimilarityThreshold;
  const semanticWeight = options.semanticWeight ?? 0.7;
  const keywordWeight = options.keywordWeight ?? 0.3;

  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  logger.info('Executing hybrid search', { userId, query: trimmedQuery, topK });

  // 1. Semantic Search
  const semanticScores = new Map<string, number>();
  try {
    const embeddingProvider = getEmbeddingProvider();
    const queryVector = await embeddingProvider.generateEmbedding(trimmedQuery);
    const vectorStore = getVectorStore();
    const vectorResults = await vectorStore.search(queryVector, {
      userId,
      topK: topK * 3,
      threshold,
    });

    for (const res of vectorResults) {
      semanticScores.set(res.id, res.score);
    }
  } catch (err) {
    logger.warn('Semantic search failed, falling back to keyword search', { error: err });
  }

  // 2. Keyword Search
  const tokens = extractSearchTokens(trimmedQuery);
  const keywordScores = new Map<string, number>();

  if (tokens.length > 0) {
    const matchingChunks = await prisma.documentChunk.findMany({
      where: {
        userId,
        document: { status: 'READY' },
        OR: tokens.map((token) => ({
          content: { contains: token, mode: 'insensitive' },
        })),
      },
      select: { id: true, content: true },
      take: topK * 5,
    });

    for (const chunk of matchingChunks) {
      const lowerContent = chunk.content.toLowerCase();
      let matchCount = 0;
      for (const token of tokens) {
        if (lowerContent.includes(token)) {
          matchCount++;
        }
      }
      const score = matchCount / tokens.length;
      keywordScores.set(chunk.id, score);
    }
  }

  // 3. Score Fusion (Weighted Linear Combination)
  const candidateChunkIds = new Set([...semanticScores.keys(), ...keywordScores.keys()]);
  if (candidateChunkIds.size === 0) {
    return [];
  }

  const chunks = await prisma.documentChunk.findMany({
    where: {
      id: { in: Array.from(candidateChunkIds) },
      userId, // Strict user isolation guarantee
      document: { status: 'READY' },
    },
    include: {
      document: {
        select: {
          id: true,
          filename: true,
          originalFilename: true,
        },
      },
    },
  });

  const rankedItems: SearchResultItem[] = [];

  for (const chunk of chunks) {
    const sScore = semanticScores.get(chunk.id) || 0;
    const kScore = keywordScores.get(chunk.id) || 0;
    const combinedScore = sScore > 0 && kScore > 0
      ? sScore * semanticWeight + kScore * keywordWeight
      : sScore > 0
      ? sScore
      : kScore * 0.7; // Lower confidence for pure keyword match without semantic score

    rankedItems.push({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.document.originalFilename || chunk.document.filename,
      filename: chunk.document.filename,
      content: chunk.content,
      pageNumber: chunk.pageNumber ?? undefined,
      slideNumber: chunk.slideNumber ?? undefined,
      timestamp: chunk.timestamp ?? undefined,
      sectionTitle: chunk.sectionTitle ?? undefined,
      score: Math.min(1.0, Math.max(0.0, combinedScore)),
    });
  }

  rankedItems.sort((a, b) => b.score - a.score);
  return rankedItems.slice(0, topK);
}

