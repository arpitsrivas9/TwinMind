import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';

export type VectorRecord = {
  id: string; // chunkId
  documentId: string;
  userId: string;
  vector: number[];
  metadata?: Record<string, unknown>;
};

export type VectorSearchOptions = {
  userId: string;
  topK?: number;
  threshold?: number;
};

export type VectorSearchResult = {
  id: string; // chunkId
  documentId: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export interface IVectorStore {
  upsert(vectors: VectorRecord[]): Promise<void>;
  search(queryVector: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]>;
  deleteByDocument(documentId: string, userId: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Built-in PostgreSQL vector store.
 * Persists and searches vectors directly in PostgreSQL with strict userId isolation.
 */
export class PostgresVectorStore implements IVectorStore {
  async upsert(vectors: VectorRecord[]): Promise<void> {
    for (const item of vectors) {
      await prisma.documentChunk.update({
        where: { id: item.id },
        data: { embedding: item.vector },
      });
    }
  }

  async search(queryVector: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const topK = options.topK || env.ragTopK;
    const threshold = options.threshold !== undefined ? options.threshold : env.ragSimilarityThreshold;

    // Fetch user's chunks containing embeddings with strict user isolation
    const chunks = await prisma.documentChunk.findMany({
      where: {
        userId: options.userId,
        document: { status: 'READY' },
      },
      select: {
        id: true,
        documentId: true,
        embedding: true,
        pageNumber: true,
        slideNumber: true,
        timestamp: true,
        sectionTitle: true,
      },
    });

    const scoredResults: VectorSearchResult[] = [];

    for (const chunk of chunks) {
      if (!chunk.embedding || chunk.embedding.length === 0) continue;
      const score = cosineSimilarity(queryVector, chunk.embedding);

      if (score >= threshold) {
        scoredResults.push({
          id: chunk.id,
          documentId: chunk.documentId,
          score,
          metadata: {
            pageNumber: chunk.pageNumber,
            slideNumber: chunk.slideNumber,
            timestamp: chunk.timestamp,
            sectionTitle: chunk.sectionTitle,
          },
        });
      }
    }

    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.slice(0, topK);
  }

  async deleteByDocument(documentId: string, userId: string): Promise<void> {
    await prisma.documentChunk.deleteMany({
      where: { documentId, userId },
    });
  }

  async deleteByUser(userId: string): Promise<void> {
    await prisma.documentChunk.deleteMany({
      where: { userId },
    });
  }
}

/**
 * ChromaDB Vector Store Adapter.
 * Integrates with ChromaDB REST API with user metadata filtering and Postgres fallback.
 */
export class ChromaVectorStore implements IVectorStore {
  private chromaUrl: string;
  private fallbackStore = new PostgresVectorStore();
  private collectionName = 'twinmind_documents';

  constructor(chromaUrl = env.vectorDbUrl) {
    this.chromaUrl = chromaUrl.replace(/\/+$/, '');
  }

  private async getCollectionId(): Promise<string | null> {
    try {
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/${this.collectionName}`);
      if (res.ok) {
        const data = (await res.json()) as { id: string };
        return data.id;
      }
      if (res.status === 404) {
        const createRes = await fetch(`${this.chromaUrl}/api/v1/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: this.collectionName }),
        });
        if (createRes.ok) {
          const createData = (await createRes.json()) as { id: string };
          return createData.id;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async upsert(vectors: VectorRecord[]): Promise<void> {
    // Always persist to Postgres source-of-truth first
    await this.fallbackStore.upsert(vectors);

    const collectionId = await this.getCollectionId();
    if (!collectionId || vectors.length === 0) return;

    try {
      await fetch(`${this.chromaUrl}/api/v1/collections/${collectionId}/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: vectors.map((v) => v.id),
          embeddings: vectors.map((v) => v.vector),
          metadatas: vectors.map((v) => ({
            userId: v.userId,
            documentId: v.documentId,
            ...(v.metadata || {}),
          })),
        }),
      });
    } catch (err) {
      logger.warn('ChromaDB upsert failed, continuing with Postgres store', { error: err });
    }
  }

  async search(queryVector: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const collectionId = await this.getCollectionId();
    if (!collectionId) {
      return this.fallbackStore.search(queryVector, options);
    }

    try {
      const topK = options.topK || env.ragTopK;
      const res = await fetch(`${this.chromaUrl}/api/v1/collections/${collectionId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query_embeddings: [queryVector],
          n_results: topK,
          where: { userId: options.userId },
        }),
      });

      if (!res.ok) {
        return this.fallbackStore.search(queryVector, options);
      }

      const data = (await res.json()) as {
        ids?: string[][];
        distances?: number[][];
        metadatas?: Array<Array<Record<string, unknown>>>;
      };

      if (!data.ids || data.ids.length === 0 || data.ids[0].length === 0) {
        return this.fallbackStore.search(queryVector, options);
      }

      const ids = data.ids[0];
      const distances = data.distances ? data.distances[0] : [];
      const metadatas = data.metadatas ? data.metadatas[0] : [];
      const results: VectorSearchResult[] = [];

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const dist = distances[i] !== undefined ? distances[i] : 0;
        // Convert distance to similarity score
        const score = 1 / (1 + dist);
        const meta = metadatas[i] || {};
        const documentId = (meta.documentId as string) || '';

        results.push({
          id,
          documentId,
          score,
          metadata: meta,
        });
      }

      return results;
    } catch {
      return this.fallbackStore.search(queryVector, options);
    }
  }

  async deleteByDocument(documentId: string, userId: string): Promise<void> {
    await this.fallbackStore.deleteByDocument(documentId, userId);
    const collectionId = await this.getCollectionId();
    if (!collectionId) return;

    try {
      await fetch(`${this.chromaUrl}/api/v1/collections/${collectionId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          where: {
            $and: [{ documentId }, { userId }],
          },
        }),
      });
    } catch {
      // Ignore Chroma deletion failures as Postgres was already updated
    }
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.fallbackStore.deleteByUser(userId);
    const collectionId = await this.getCollectionId();
    if (!collectionId) return;

    try {
      await fetch(`${this.chromaUrl}/api/v1/collections/${collectionId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          where: { userId },
        }),
      });
    } catch {
      // Ignore Chroma deletion failures
    }
  }
}

let activeVectorStore: IVectorStore | null = null;

export function getVectorStore(): IVectorStore {
  if (!activeVectorStore) {
    activeVectorStore = new PostgresVectorStore();
  }
  return activeVectorStore;
}

export function setVectorStore(store: IVectorStore) {
  activeVectorStore = store;
}

