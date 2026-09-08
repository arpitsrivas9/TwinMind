import request from 'supertest';
import app from '../src/app';
import {
  buildGeminiContents,
  fitMessagesToBudget,
  ContextMessage,
} from '../src/services/promptService';

describe('AI Services, Prompts, and Model Registry', () => {
  describe('Gemini Multi-Turn Content Normalization', () => {
    it('should drop leading model/assistant messages so first turn is always user', () => {
      const messages: ContextMessage[] = [
        { role: 'ASSISTANT', content: 'Leading assistant greeting' },
        { role: 'USER', content: 'User first question' },
        { role: 'ASSISTANT', content: 'Assistant reply' },
      ];

      const turns = buildGeminiContents(messages);

      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[0].parts[0].text).toBe('User first question');
      expect(turns[1].role).toBe('model');
      expect(turns[1].parts[0].text).toBe('Assistant reply');
    });

    it('should merge consecutive user messages into a single turn', () => {
      const messages: ContextMessage[] = [
        { role: 'USER', content: 'First user line' },
        { role: 'USER', content: 'Second user line' },
        { role: 'ASSISTANT', content: 'Assistant answer' },
      ];

      const turns = buildGeminiContents(messages);

      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[0].parts.length).toBe(2);
      expect(turns[0].parts[0].text).toBe('First user line');
      expect(turns[0].parts[1].text).toBe('Second user line');
      expect(turns[1].role).toBe('model');
    });

    it('should merge consecutive assistant messages into a single turn', () => {
      const messages: ContextMessage[] = [
        { role: 'USER', content: 'Question' },
        { role: 'ASSISTANT', content: 'Part 1' },
        { role: 'ASSISTANT', content: 'Part 2' },
      ];

      const turns = buildGeminiContents(messages);

      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[1].role).toBe('model');
      expect(turns[1].parts.length).toBe(2);
      expect(turns[1].parts[0].text).toBe('Part 1');
      expect(turns[1].parts[1].text).toBe('Part 2');
    });

    it('should strip empty and whitespace-only messages', () => {
      const messages: ContextMessage[] = [
        { role: 'USER', content: '   ' },
        { role: 'USER', content: 'Real question' },
        { role: 'ASSISTANT', content: '' },
        { role: 'ASSISTANT', content: 'Real answer' },
      ];

      const turns = buildGeminiContents(messages);

      expect(turns.length).toBe(2);
      expect(turns[0].role).toBe('user');
      expect(turns[0].parts[0].text).toBe('Real question');
      expect(turns[1].role).toBe('model');
      expect(turns[1].parts[0].text).toBe('Real answer');
    });

    it('should handle completely empty message list gracefully', () => {
      const turns = buildGeminiContents([]);
      expect(turns.length).toBe(1);
      expect(turns[0].role).toBe('user');
      expect(turns[0].parts[0].text).toBeTruthy();
    });
  });

  describe('Context Budgeting (fitMessagesToBudget)', () => {
    it('should retain all messages when total length is within budget', () => {
      const messages: ContextMessage[] = [
        { role: 'USER', content: 'Short 1' },
        { role: 'ASSISTANT', content: 'Short 2' },
        { role: 'USER', content: 'Short 3' },
      ];

      const budgeted = fitMessagesToBudget(messages, 1000);
      expect(budgeted.length).toBe(3);
    });

    it('should drop oldest messages when budget is exceeded, preserving newest', () => {
      const messages: ContextMessage[] = [
        { role: 'USER', content: 'Old message that should be dropped '.repeat(50) }, // ~1600 chars
        { role: 'ASSISTANT', content: 'Middle message '.repeat(20) }, // ~300 chars
        { role: 'USER', content: 'Latest message that MUST be kept' }, // 32 chars
      ];

      // Set budget so only the last two fit
      const budgeted = fitMessagesToBudget(messages, 500);

      expect(budgeted.length).toBe(2);
      expect(budgeted[budgeted.length - 1].content).toBe('Latest message that MUST be kept');
      expect(budgeted[0].content).toContain('Middle message');
    });
  });

  describe('Model Registry and AI API Routes', () => {
    let authToken: string;

    beforeAll(async () => {
      const email = `ai_test_${Date.now()}@example.com`;
      const res = await request(app).post('/api/auth/signup').send({
        name: 'AI Tester',
        email,
        password: 'Password123!',
      });
      authToken = res.body.data.token;
    });

    it('should list configured models for authenticated users', async () => {
      const res = await request(app)
        .get('/api/ai/models')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should reject unauthenticated request to /api/ai/models', async () => {
      const res = await request(app).get('/api/ai/models');
      expect(res.status).toBe(401);
    });

    it('should reject message with unsupported or unconfigured model', async () => {
      // First create a conversation
      const conv = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Model test' });

      const res = await request(app)
        .post(`/api/conversations/${conv.body.data.id}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Test query',
          model: 'unsupported-fantasy-model-xyz',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not configured or supported');
    });
  });
});
