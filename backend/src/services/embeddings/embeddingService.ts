import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../middleware/errorHandler';

export interface IEmbeddingProvider {
  dimension: number;
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  dimension = 3072;
  private apiKey: string;
  private model: string;

  constructor(apiKey = env.geminiApiKey, model = env.embeddingModel) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const [result] = await this.generateEmbeddings([text]);
    return result;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new AppError('Gemini API key is not configured for embeddings', 503);
    }

    if (texts.length === 0) return [];

    const results: number[][] = [];
    // Process in batches of 30 to comply with API limits
    const batchSize = 30;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:batchEmbedContents?key=${encodeURIComponent(this.apiKey)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text: text.slice(0, 8000) }] },
          })),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error('Gemini batch embed failed', { status: res.status, error: errorText });
        throw new AppError('Failed to generate embeddings from Gemini API', 502);
      }

      const data = (await res.json()) as {
        embeddings?: Array<{ values?: number[] }>;
      };

      if (!data.embeddings || data.embeddings.length !== batch.length) {
        throw new AppError('Incomplete embedding response from Gemini API', 502);
      }

      for (const item of data.embeddings) {
        results.push(item.values || []);
      }
    }

    return results;
  }
}

export class OpenAiEmbeddingProvider implements IEmbeddingProvider {
  dimension = 1536;
  private apiKey: string;

  constructor(apiKey = env.openAiApiKey) {
    this.apiKey = apiKey;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const [result] = await this.generateEmbeddings([text]);
    return result;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new AppError('OpenAI API key is not configured for embeddings', 503);
    }

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts.map((t) => t.slice(0, 8000)),
      }),
    });

    if (!res.ok) {
      throw new AppError('Failed to generate embeddings from OpenAI', 502);
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return (data.data || []).map((d) => d.embedding || []);
  }
}

/**
 * Deterministic pseudo-embedding provider for offline tests.
 * Computes normalized bag-of-words / character n-gram projections.
 */
export class MockEmbeddingProvider implements IEmbeddingProvider {
  dimension = 64;

  async generateEmbedding(text: string): Promise<number[]> {
    const vector = new Array(this.dimension).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
      const code = normalized.charCodeAt(i);
      const index = (code * 31 + i) % this.dimension;
      vector[index] += 1;
    }

    // Normalize vector to unit length
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map((v) => v / norm);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.generateEmbedding(t)));
  }
}

let activeEmbeddingProvider: IEmbeddingProvider | null = null;

export function getEmbeddingProvider(): IEmbeddingProvider {
  if (activeEmbeddingProvider) return activeEmbeddingProvider;

  if (process.env.NODE_ENV === 'test' && !env.geminiApiKey && !env.openAiApiKey) {
    return new MockEmbeddingProvider();
  }

  if (env.embeddingProvider === 'gemini' && env.geminiApiKey) {
    activeEmbeddingProvider = new GeminiEmbeddingProvider();
  } else if (env.embeddingProvider === 'openai' && env.openAiApiKey) {
    activeEmbeddingProvider = new OpenAiEmbeddingProvider();
  } else if (env.geminiApiKey) {
    activeEmbeddingProvider = new GeminiEmbeddingProvider();
  } else {
    activeEmbeddingProvider = new MockEmbeddingProvider();
  }

  return activeEmbeddingProvider;
}

export function setEmbeddingProvider(provider: IEmbeddingProvider) {
  activeEmbeddingProvider = provider;
}

