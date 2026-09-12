import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { cosineSimilarity, PostgresVectorStore } from '../src/services/vector/vectorStore';
import { hybridSearch } from '../src/services/search/hybridSearchService';

describe('TwinMind TwinSearch™ Hybrid Search & Vector Store Test Suite', () => {
  let tokenUserA: string;
  let userAId: string;
  let tokenUserB: string;
  let userBId: string;
  let docAId: string;
  let docBId: string;

  beforeAll(async () => {
    // Register User A
    const resA = await request(app).post('/api/auth/signup').send({
      name: 'Searcher A',
      email: `searcher_a_${Date.now()}@example.com`,
      password: 'Password123!',
    });
    tokenUserA = resA.body.data.token;
    userAId = resA.body.data.user.id;

    // Register User B
    const resB = await request(app).post('/api/auth/signup').send({
      name: 'Searcher B',
      email: `searcher_b_${Date.now()}@example.com`,
      password: 'Password123!',
    });
    tokenUserB = resB.body.data.token;
    userBId = resB.body.data.user.id;

    // Seed document and chunks for User A
    const docA = await prisma.document.create({
      data: {
        userId: userAId,
        filename: 'a_arch.md',
        originalFilename: 'System Architecture.md',
        mimeType: 'text/markdown',
        fileSize: 1024,
        storageKey: 'storage/a_arch.md',
        checksum: 'dummychecksuma',
        status: 'READY',
      },
    });
    docAId = docA.id;

    await prisma.documentChunk.create({
      data: {
        documentId: docA.id,
        userId: userAId,
        chunkIndex: 0,
        content: 'TwinMind incorporates hybrid vector search combining dense embeddings with sparse lexical ranking for high recall.',
        pageNumber: 1,
        embedding: [1, 0, 0, 0],
      },
    });

    // Seed document and chunks for User B
    const docB = await prisma.document.create({
      data: {
        userId: userBId,
        filename: 'b_secret.md',
        originalFilename: 'Confidential Strategy.md',
        mimeType: 'text/markdown',
        fileSize: 1024,
        storageKey: 'storage/b_secret.md',
        checksum: 'dummychecksumb',
        status: 'READY',
      },
    });
    docBId = docB.id;

    await prisma.documentChunk.create({
      data: {
        documentId: docB.id,
        userId: userBId,
        chunkIndex: 0,
        content: 'Project Neptune top secret blueprint for competitor acquisition.',
        pageNumber: 1,
        embedding: [0, 1, 0, 0],
      },
    });
  });

  afterAll(async () => {
    await prisma.documentChunk.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
    await prisma.document.deleteMany({
      where: { id: { in: [docAId, docBId] } },
    });
  });

  describe('1. Cosine Similarity Calculation', () => {
    it('should compute exact cosine similarity between normalized and unnormalized vectors', () => {
      expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
      expect(cosineSimilarity([1, 1], [1, 1])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    it('should handle zero-vector and mismatched lengths gracefully', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
      expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    });
  });

  describe('2. Vector Store Isolation (PostgresVectorStore)', () => {
    const store = new PostgresVectorStore();

    it('should retrieve chunks only belonging to requesting user', async () => {
      // User A queries with vector aligned to [1, 0, 0, 0]
      const resultsA = await store.search([1, 0, 0, 0], {
        userId: userAId,
        topK: 5,
        threshold: 0.5,
      });

      expect(resultsA.length).toBeGreaterThanOrEqual(1);
      expect(resultsA[0].documentId).toBe(docAId);

      // User B searches with the exact same vector [1, 0, 0, 0]
      const resultsB = await store.search([1, 0, 0, 0], {
        userId: userBId,
        topK: 5,
        threshold: 0.5,
      });

      // User B should NOT get User A's chunk even though vector match is 1.0!
      const leakedUserAChunk = resultsB.find((r) => r.documentId === docAId);
      expect(leakedUserAChunk).toBeUndefined();
    });
  });

  describe('3. Hybrid Search (Semantic + Lexical Fusion)', () => {
    it('should find relevant chunks via keyword & semantic matching for owner', async () => {
      const results = await hybridSearch({
        query: 'hybrid vector search recall',
        userId: userAId,
        limit: 5,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].documentTitle).toBe('System Architecture.md');
      expect(results[0].content).toContain('hybrid vector search');
    });

    it('should NEVER leak chunks across different users during search', async () => {
      // User A searches for Neptune (secret of User B)
      const resultsA = await hybridSearch({
        query: 'Project Neptune top secret blueprint',
        userId: userAId,
        limit: 5,
      });

      // User A should find NOTHING related to User B's document
      const leakedDoc = resultsA.find((r: any) => r.documentTitle === 'Confidential Strategy.md');
      expect(leakedDoc).toBeUndefined();
    });
  });

  describe('4. Search API Endpoint (/api/search)', () => {
    it('should reject unauthenticated search requests with 401', async () => {
      const res = await request(app).get('/api/search?q=architecture');
      expect(res.status).toBe(401);
    });

    it('should reject requests with empty query with 400', async () => {
      const res = await request(app)
        .get('/api/search?q=')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(400);
    });

    it('should return search results for authenticated user', async () => {
      const res = await request(app)
        .get('/api/search?q=hybrid')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.results[0].documentTitle).toBe('System Architecture.md');
      expect(res.body.data.query).toBe('hybrid');
    });
  });
});

