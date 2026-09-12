import request from 'supertest';
import app from '../src/app';
import { elevateTrustSessionForTesting } from '../src/services/trust/trustSessionService';
import {
  containsSensitiveInformation,
  validateMemoryContent,
} from '../src/services/memory/memoryValidator';
import {
  isCandidateForMemory,
  fallbackExtractFromText,
} from '../src/services/memory/memoryExtractor';
import { analyzeDeduplication } from '../src/services/memory/memoryDeduplicator';
import { rankMemoriesForPrompt } from '../src/services/memory/memoryRanker';
import {
  formatRetrievedMemories,
  buildSystemPromptWithMemories,
} from '../src/services/promptService';
import type { Memory } from '@prisma/client';

describe('TwinMind TwinMemory™ 🧠 Test Suite', () => {
  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    const emailA = `memory_test_a_${Date.now()}@example.com`;
    const resA = await request(app).post('/api/auth/signup').send({
      name: 'Memory Owner A',
      email: emailA,
      password: 'Password123!',
    });
    tokenUserA = resA.body.data.token;
    await elevateTrustSessionForTesting(resA.body.data.user.id);

    const emailB = `memory_test_b_${Date.now()}@example.com`;
    const resB = await request(app).post('/api/auth/signup').send({
      name: 'Memory Attacker B',
      email: emailB,
      password: 'Password123!',
    });
    tokenUserB = resB.body.data.token;
    await elevateTrustSessionForTesting(resB.body.data.user.id);
  });

  describe('1. Sensitive Information Validator', () => {
    it('should detect OpenAI, Google, Anthropic, and AWS API keys', () => {
      expect(containsSensitiveInformation('Here is my key: sk-abc1234567890123456789012345')).toBe(true);
      expect(containsSensitiveInformation('AIzaSyD1234567890123456789012345678901')).toBe(true);
      expect(containsSensitiveInformation('AKIAIOSFODNN7EXAMPLE')).toBe(true);
      expect(containsSensitiveInformation('sk-ant-api03-1234567890123456789012')).toBe(true);
    });

    it('should detect passwords and private keys', () => {
      expect(containsSensitiveInformation('password = "SuperSecret123!"')).toBe(true);
      expect(containsSensitiveInformation('my password is secretpassword123')).toBe(true);
      expect(containsSensitiveInformation('-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...')).toBe(true);
    });

    it('should validate memory content correctly', () => {
      const valid = validateMemoryContent('User prefers dark mode and concise responses.');
      expect(valid.valid).toBe(true);

      const tooShort = validateMemoryContent('hi');
      expect(tooShort.valid).toBe(false);

      const hasSecret = validateMemoryContent('User API key is sk-123456789012345678901234567890');
      expect(hasSecret.valid).toBe(false);
      expect(hasSecret.reason).toContain('sensitive');
    });
  });

  describe('2. Memory Candidate Detection & Extraction', () => {
    it('should detect candidate personal statements', () => {
      expect(isCandidateForMemory('I prefer concise bullet-point answers.')).toBe(true);
      expect(isCandidateForMemory('My goal is to become a senior backend engineer.')).toBe(true);
      expect(isCandidateForMemory("I'm building a project called TwinMind with Next.js.")).toBe(true);
      expect(isCandidateForMemory('I work as a software architect in Seattle.')).toBe(true);
    });

    it('should ignore generic knowledge queries and trivial messages', () => {
      expect(isCandidateForMemory('What is the capital of France?')).toBe(false);
      expect(isCandidateForMemory('How do I reverse a binary tree in Python?')).toBe(false);
      expect(isCandidateForMemory('hello there')).toBe(false);
      expect(isCandidateForMemory('thanks!')).toBe(false);
    });

    it('should ignore temporary and transient statements', () => {
      expect(isCandidateForMemory("I'm going to the gym today")).toBe(false);
      expect(isCandidateForMemory('I am having lunch right now')).toBe(false);
    });

    it('should correctly classify fallback candidate extractions', () => {
      const pref = fallbackExtractFromText('I prefer concise responses.');
      expect(pref).toHaveLength(1);
      expect(pref[0].type).toBe('USER_PREFERENCE');
      expect(pref[0].importance).toBeGreaterThanOrEqual(7);

      const goal = fallbackExtractFromText('My goal is to finish TwinMind within 3 months.');
      expect(goal).toHaveLength(1);
      expect(goal[0].type).toBe('GOAL');

      const proj = fallbackExtractFromText("I'm building a cognitive operating system called TwinMind.");
      expect(proj).toHaveLength(1);
      expect(proj[0].type).toBe('PROJECT');
    });
  });

  describe('3. Deduplication & Conflict Resolution', () => {
    const mockMemory: Memory = {
      id: 'mem_1',
      userId: 'user_1',
      type: 'USER_PREFERENCE',
      content: 'User prefers concise answers.',
      summary: 'Prefers concise answers',
      importance: 8,
      confidence: 0.9,
      sourceConversationId: null,
      sourceMessageId: null,
      isActive: true,
      lastAccessedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should identify near-duplicate statements and recommend DUPLICATE action', () => {
      const decision = analyzeDeduplication([mockMemory], {
        type: 'USER_PREFERENCE',
        content: 'User prefers concise answers.',
        summary: 'Prefers concise answers',
        importance: 8,
        confidence: 0.95,
      });

      expect(decision.action).toBe('DUPLICATE');
      expect(decision.targetMemory?.id).toBe('mem_1');
    });

    it('should identify contradicting preferences and recommend SUPERSEDE action', () => {
      const decision = analyzeDeduplication([mockMemory], {
        type: 'USER_PREFERENCE',
        content: 'User prefers detailed in-depth technical explanations.',
        summary: 'Prefers detailed technical explanations',
        importance: 8,
        confidence: 0.95,
      });

      expect(decision.action).toBe('SUPERSEDE');
      expect(decision.targetMemory?.id).toBe('mem_1');
    });

    it('should recommend NEW action when candidate is unrelated', () => {
      const decision = analyzeDeduplication([mockMemory], {
        type: 'PROJECT',
        content: 'User is building TwinMind with Next.js.',
        summary: 'Building TwinMind with Next.js',
        importance: 7,
        confidence: 0.9,
      });

      expect(decision.action).toBe('NEW');
    });
  });

  describe('4. Relevance Ranking & Prompt Injection', () => {
    const mockMemories: Memory[] = [
      {
        id: 'mem_pref',
        userId: 'user_1',
        type: 'USER_PREFERENCE',
        content: 'User prefers TypeScript over JavaScript.',
        summary: 'Prefers TypeScript',
        importance: 8,
        confidence: 0.95,
        sourceConversationId: null,
        sourceMessageId: null,
        isActive: true,
        lastAccessedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'mem_unrelated',
        userId: 'user_1',
        type: 'EPISODIC',
        content: 'User completed a marathon last year.',
        summary: 'Completed marathon',
        importance: 4,
        confidence: 0.8,
        sourceConversationId: null,
        sourceMessageId: null,
        isActive: true,
        lastAccessedAt: new Date(Date.now() - 1000000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should rank relevant memories higher based on prompt keywords', () => {
      const ranked = rankMemoriesForPrompt(mockMemories, 'Can you help me write a TypeScript function?');
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].id).toBe('mem_pref');
    });

    it('should format retrieved memories with safety instructions', () => {
      const formatted = formatRetrievedMemories([
        { type: 'USER_PREFERENCE', content: 'User prefers concise answers.' },
      ]);

      expect(formatted).toContain('<retrieved_personal_memories>');
      expect(formatted).toContain('[User Preference] User prefers concise answers.');
      expect(formatted).toContain('SECURITY NOTICE');
      expect(formatted).toContain('</retrieved_personal_memories>');
    });

    it('should assemble system prompt with injected memories', () => {
      const prompt = buildSystemPromptWithMemories([
        { type: 'PROJECT', content: 'User is building TwinMind.' },
      ]);
      expect(prompt).toContain('You are TwinMind');
      expect(prompt).toContain('<retrieved_personal_memories>');
      expect(prompt).toContain('[Project] User is building TwinMind.');
    });
  });

  describe('5. Memory REST API (CRUD, Search & Bulk Delete)', () => {
    let createdMemoryId: string;

    it('should create a new memory manually', async () => {
      const res = await request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'USER_PREFERENCE',
          content: 'User prefers dark mode and high-contrast themes.',
          summary: 'Prefers dark mode',
          importance: 7,
          confidence: 0.95,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.type).toBe('USER_PREFERENCE');
      createdMemoryId = res.body.data.id;
    });

    it('should reject memory creation containing sensitive secrets', async () => {
      const res = await request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'SEMANTIC',
          content: 'User token is Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotStoreThisSecret123',
          importance: 5,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('sensitive');
    });

    it('should list memories for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.memories)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('should filter memories by type', async () => {
      const res = await request(app)
        .get('/api/memories?type=USER_PREFERENCE')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.memories.every((m: { type: string }) => m.type === 'USER_PREFERENCE')).toBe(true);
    });

    it('should search memories by query string', async () => {
      const res = await request(app)
        .get('/api/memories/search?q=dark%20mode')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].content).toContain('dark mode');
    });

    it('should get a single memory by ID', async () => {
      const res = await request(app)
        .get(`/api/memories/${createdMemoryId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdMemoryId);
    });

    it('should update an existing memory', async () => {
      const res = await request(app)
        .patch(`/api/memories/${createdMemoryId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          importance: 9,
          summary: 'Prefers OLED dark mode',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.importance).toBe(9);
      expect(res.body.data.summary).toBe('Prefers OLED dark mode');
    });

    it('should delete a single memory by ID', async () => {
      const res = await request(app)
        .delete(`/api/memories/${createdMemoryId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(204);

      // Verify deletion
      const checkRes = await request(app)
        .get(`/api/memories/${createdMemoryId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(checkRes.status).toBe(404);
    });
  });

  describe('6. Privacy Controls & Settings', () => {
    it('should retrieve default memory settings', async () => {
      const res = await request(app)
        .get('/api/memories/settings')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(true);
      expect(res.body.data.autoExtract).toBe(true);
    });

    it('should update memory settings (toggle enabled to false)', async () => {
      const res = await request(app)
        .patch('/api/memories/settings')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(false);

      // Re-enable for subsequent tests
      await request(app)
        .patch('/api/memories/settings')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ enabled: true });
    });

    it('should clear all memories for user', async () => {
      // Create two memories
      await request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ type: 'SEMANTIC', content: 'User knows Python.' });

      await request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ type: 'GOAL', content: 'User wants to learn Rust.' });

      const clearRes = await request(app)
        .delete('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(clearRes.status).toBe(200);
      expect(clearRes.body.success).toBe(true);

      const listRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(listRes.body.data.total).toBe(0);
      expect(listRes.body.data.memories).toHaveLength(0);
    });
  });

  describe('7. Security & User Isolation (IDOR Protection)', () => {
    let memoryUserAId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/memories')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          type: 'PROJECT',
          content: 'Confidential project details of User A.',
          importance: 10,
        });
      memoryUserAId = res.body.data.id;
    });

    it('should prevent User B from reading User A memory (IDOR read)', async () => {
      const res = await request(app)
        .get(`/api/memories/${memoryUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from modifying User A memory (IDOR write)', async () => {
      const res = await request(app)
        .patch(`/api/memories/${memoryUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ content: 'Tampered by User B.' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from deleting User A memory (IDOR delete)', async () => {
      const res = await request(app)
        .delete(`/api/memories/${memoryUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });

    it('should reject unauthenticated memory requests', async () => {
      const resList = await request(app).get('/api/memories');
      expect(resList.status).toBe(401);

      const resCreate = await request(app).post('/api/memories').send({ content: 'Test' });
      expect(resCreate.status).toBe(401);
    });
  });
});
