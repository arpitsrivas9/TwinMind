import request from 'supertest';
import app from '../src/app';

describe('TwinMind Conversations and Messages API', () => {
  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    const emailA = `conv_test_a_${Date.now()}@example.com`;
    const resA = await request(app).post('/api/auth/signup').send({
      name: 'User A',
      email: emailA,
      password: 'Password123!',
    });
    tokenUserA = resA.body.data.token;

    const emailB = `conv_test_b_${Date.now()}@example.com`;
    const resB = await request(app).post('/api/auth/signup').send({
      name: 'User B',
      email: emailB,
      password: 'Password123!',
    });
    tokenUserB = resB.body.data.token;
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated request to list conversations', async () => {
      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated request to create conversation', async () => {
      const res = await request(app).post('/api/conversations').send({ title: 'Test' });
      expect(res.status).toBe(401);
    });
  });

  describe('Conversation Lifecycle (CRUD)', () => {
    let createdConvId: string;

    it('should create a new conversation with a specified title', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ title: 'Quantum Neural Systems' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe('Quantum Neural Systems');
      createdConvId = res.body.data.id;
    });

    it('should list conversations for the authenticated user', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((c: { id: string }) => c.id === createdConvId)).toBe(true);
    });

    it('should retrieve a single conversation by ID', async () => {
      const res = await request(app)
        .get(`/api/conversations/${createdConvId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdConvId);
      expect(res.body.data.title).toBe('Quantum Neural Systems');
    });

    it('should rename an existing conversation', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${createdConvId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ title: 'Updated Quantum Architectures' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Updated Quantum Architectures');
    });

    it('should delete a conversation', async () => {
      const res = await request(app)
        .delete(`/api/conversations/${createdConvId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(204);

      // Verify it is gone
      const verify = await request(app)
        .get(`/api/conversations/${createdConvId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);
      expect(verify.status).toBe(404);
    });
  });

  describe('User Isolation & IDOR Protection', () => {
    let convUserAId: string;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ title: 'User A Confidential Roadmap' });
      convUserAId = res.body.data.id;
    });

    it('should prevent User B from retrieving User A conversation', async () => {
      const res = await request(app)
        .get(`/api/conversations/${convUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent User B from renaming User A conversation', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${convUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ title: 'Hijacked by B' });

      expect(res.status).toBe(404);
    });

    it('should prevent User B from deleting User A conversation', async () => {
      const res = await request(app)
        .delete(`/api/conversations/${convUserAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });

    it('should prevent User B from listing User A messages', async () => {
      const res = await request(app)
        .get(`/api/conversations/${convUserAId}/messages`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(res.status).toBe(404);
    });

    it('should prevent User B from posting a message to User A conversation', async () => {
      const res = await request(app)
        .post(`/api/conversations/${convUserAId}/messages`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ content: 'Hello unauthorized', model: 'gpt-4o-mini' });

      // Either 404 (conversation not found for user B) or 400 (invalid model if unconfigured)
      expect([400, 404]).toContain(res.status);
    });

    it('should isolate conversation search results by user', async () => {
      // User A searches for Confidential -> finds 1
      const resA = await request(app)
        .get('/api/conversations/search?q=Confidential')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(resA.status).toBe(200);
      expect(resA.body.data.some((c: { id: string }) => c.id === convUserAId)).toBe(true);

      // User B searches for Confidential -> finds 0
      const resB = await request(app)
        .get('/api/conversations/search?q=Confidential')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(resB.status).toBe(200);
      expect(resB.body.data.length).toBe(0);
    });
  });

  describe('Validation & Edge Cases', () => {
    it('should reject invalid CUID conversation ID on retrieve', async () => {
      const res = await request(app)
        .get('/api/conversations/not-a-valid-cuid')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid conversation id');
    });

    it('should reject invalid CUID on message route', async () => {
      const res = await request(app)
        .post('/api/conversations/not-a-valid-cuid/messages')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ content: 'test', model: 'gpt-4o-mini' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid conversation id');
    });

    it('should reject empty message content', async () => {
      const conv = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ title: 'Empty message test' });

      const res = await request(app)
        .post(`/api/conversations/${conv.body.data.id}/messages`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ content: '   ', model: 'gpt-4o-mini' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
