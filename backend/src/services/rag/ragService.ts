import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { searchUserKnowledge, type SearchResultItem } from '../search/hybridSearchService';
import { logger } from '../../lib/logger';

const GREETING_REGEX = /^(?:hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|ok|okay|bye|goodbye)[!.?]*$/i;

import { getGraphStore } from '../graph/graphStore';
import { fallbackExtractGraphElements } from '../graph/entityExtractor';
import type { GraphRelationshipContextItem } from '../promptService';

export type GraphAwareRetrievalResult = {
  documents: SearchResultItem[];
  graphRelationships: GraphRelationshipContextItem[];
};

/**
 * Checks whether this conversation turn warrants knowledge retrieval.
 */
export async function shouldRetrieveDocuments(userId: string, prompt: string): Promise<boolean> {
  const trimmed = prompt.trim();
  if (trimmed.length < 5 || GREETING_REGEX.test(trimmed)) {
    return false;
  }

  // Quick check if user has any processed documents or graph entities
  const [docCount, entityCount] = await Promise.all([
    prisma.document.count({ where: { userId, status: 'READY' } }),
    prisma.graphEntity.count({ where: { userId } }),
  ]);

  return docCount > 0 || entityCount > 0;
}

/**
 * Retrieves graph connections and top-ranked document chunks relevant to the user query.
 * Fuses TwinGraph knowledge structure with TwinSearch hybrid content retrieval.
 */
export async function retrieveGraphAwareKnowledgeForPrompt(
  userId: string,
  prompt: string,
  topK = env.ragTopK,
): Promise<GraphAwareRetrievalResult> {
  try {
    const shouldSearch = await shouldRetrieveDocuments(userId, prompt);
    if (!shouldSearch) {
      return { documents: [], graphRelationships: [] };
    }

    // 1. Graph Expansion: identify entities mentioned in query
    const extracted = fallbackExtractGraphElements(prompt);
    const store = getGraphStore();
    const graphRelationships: GraphRelationshipContextItem[] = [];
    const connectedDocumentIds: string[] = [];

    for (const e of extracted.entities) {
      const match = await store.findEntityByName(userId, e.type, e.name);
      if (match) {
        const traversal = await store.traverse(userId, match.id, 2, { limit: 15 });

        // Collect relationships for prompt context
        for (const rel of traversal.relationships) {
          graphRelationships.push({
            sourceName: rel.sourceEntity?.name || 'Unknown',
            sourceType: rel.sourceEntity?.type || 'ENTITY',
            relationType: rel.type,
            targetName: rel.targetEntity?.name || 'Unknown',
            targetType: rel.targetEntity?.type || 'ENTITY',
            confidence: rel.confidence,
            sourceContext: rel.sourceType && rel.sourceId ? `${rel.sourceType} (${rel.sourceId})` : undefined,
          });

          // Check if any traversed node is a DOCUMENT with a documentId in metadata
          if (rel.targetEntity?.type === 'DOCUMENT') {
            const meta = rel.targetEntity.metadata as Record<string, unknown> | undefined;
            if (meta?.documentId && typeof meta.documentId === 'string') {
              connectedDocumentIds.push(meta.documentId);
            }
          }
        }
      }
    }

    // 2. Hybrid Document Search with Graph Proximity Boost
    const documents = await searchUserKnowledge(userId, prompt, {
      topK,
      threshold: env.ragSimilarityThreshold,
      boostDocumentIds: connectedDocumentIds.length > 0 ? connectedDocumentIds : undefined,
      boostFactor: env.graphRagEntityBoost,
    });

    return { documents, graphRelationships };
  } catch (err) {
    logger.warn('RAG graph-aware knowledge retrieval error, proceeding without graph context', { error: err });
    return { documents: [], graphRelationships: [] };
  }
}

/**
 * Backward-compatible helper returning top-ranked document chunks.
 */
export async function retrieveKnowledgeForPrompt(
  userId: string,
  prompt: string,
  topK = env.ragTopK,
): Promise<SearchResultItem[]> {
  const result = await retrieveGraphAwareKnowledgeForPrompt(userId, prompt, topK);
  return result.documents;
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

