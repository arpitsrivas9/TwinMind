import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { searchUserKnowledge, type SearchResultItem } from '../search/hybridSearchService';
import { logger } from '../../lib/logger';

const GREETING_REGEX = /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|ok|okay|bye|goodbye)[!.?]*$/i;

/**
 * Checks whether this conversation turn warrants knowledge retrieval.
 */
export async function shouldRetrieveDocuments(userId: string, prompt: string): Promise<boolean> {
  const trimmed = prompt.trim();
  if (trimmed.length < 5 || GREETING_REGEX.test(trimmed)) {
    return false;
  }

  // Quick check if user has any processed documents
  const docCount = await prisma.document.count({
    where: { userId, status: 'READY' },
  });

  return docCount > 0;
}

/**
 * Retrieves top-ranked document chunks relevant to the user query.
 */
export async function retrieveKnowledgeForPrompt(
  userId: string,
  prompt: string,
  topK = env.ragTopK,
): Promise<SearchResultItem[]> {
  try {
    const shouldSearch = await shouldRetrieveDocuments(userId, prompt);
    if (!shouldSearch) {
      return [];
    }

    const results = await searchUserKnowledge(userId, prompt, {
      topK,
      threshold: env.ragSimilarityThreshold,
    });

    return results;
  } catch (err) {
    logger.warn('RAG knowledge retrieval error, proceeding without document context', { error: err });
    return [];
  }
}

/**
 * Formats a clean citation label with page/slide/timestamp context.
 */
export function formatCitationLabel(item: SearchResultItem): string {
  if (item.pageNumber) {
    return `${item.documentTitle} — Page ${item.pageNumber}`;
  }
  if (item.slideNumber) {
    return `${item.documentTitle} — Slide ${item.slideNumber}`;
  }
  if (item.timestamp) {
    return `${item.documentTitle} — [${item.timestamp}]`;
  }
  return item.documentTitle;
}

/**
 * Persists citations linked to an assistant message in PostgreSQL.
 */
export async function saveMessageCitations(
  messageId: string,
  items: SearchResultItem[],
): Promise<void> {
  if (!items || items.length === 0) return;

  try {
    for (const item of items) {
      await prisma.citation.create({
        data: {
          messageId,
          documentId: item.documentId,
          chunkId: item.chunkId,
          documentTitle: item.documentTitle,
          pageNumber: item.pageNumber,
          slideNumber: item.slideNumber,
          timestamp: item.timestamp,
          snippet: item.content.slice(0, 500),
          score: item.score,
        },
      });
    }
  } catch (err) {
    logger.warn('Failed to persist message citations', { messageId, error: err });
  }
}

