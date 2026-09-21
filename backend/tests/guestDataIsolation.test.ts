import request from 'supertest';
import app from '../src/app';
import { buildSystemPromptWithKnowledge } from '../src/services/promptService';

describe('TwinMind Guest Mode Owner-Data Isolation & Security Hardening', () => {
  let userToken: string;
  let ownerConversationId: string;

  const createAssertionPayload = (challenge: string) => {
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge,
        origin: 'http://localhost:3000',
      }),
    ).toString('base64');
    return JSON.stringify({
      credentialId: `cred_test_${Date.now()}`,
      clientDataJSON,
      signature: Buffer.from('mock_signature').toString('base64'),
      authenticatorData: Buffer.from('mock_auth_data').toString('base64'),
    });
  };

  const elevateToOwner = async () => {
    const chRes = await request(app)
      .post('/api/trust/os-auth/challenge')
      .set('Authorization', `Bearer ${userToken}`);
    const challenge = chRes.body.data.challenge;
    const assertion = createAssertionPayload(challenge);
    const verRes = await request(app)
      .post('/api/trust/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ method: 'OS_AUTH', challengeResponse: assertion });
    expect(verRes.status).toBe(200);
    expect(verRes.body.data.mode).toBe('OWNER');
  };

  const demoteToGuest = async () => {
    const res = await request(app)
      .post('/api/trust/mode')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ mode: 'GUEST' });
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('GUEST');
  };

  beforeAll(async () => {
    // 1. Sign up test user
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Private Owner',
        email: `private_owner_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    userToken = signupRes.body.data.token;

    // 2. Elevate to Owner Mode to create owner data
    await elevateToOwner();

    // 3. Create an owner conversation
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'Confidential Financial Strategy' });
    expect(convRes.status).toBe(201);
    ownerConversationId = convRes.body.data.id;
  });

  describe('A. Owner Mode Baseline Verification', () => {
    it('allows Owner to list their conversations', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      const exists = res.body.data.some((c: { id: string }) => c.id === ownerConversationId);
      expect(exists).toBe(true);
    });

    it('allows Owner to fetch specific conversation messages', async () => {
      const res = await request(app)
        .get(`/api/conversations/${ownerConversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('allows Owner to fetch profile with personal details', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Private Owner');
      expect(res.body.data.email).toContain('@example.com');
      expect(res.body.data.isGuest).toBe(false);
    });
  });

  describe('B. Guest Mode Data Isolation & Access Blocking', () => {
    beforeAll(async () => {
      await demoteToGuest();
    });

    it('GET /api/conversations returns empty array in Guest Mode', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /api/conversations/search returns empty array in Guest Mode', async () => {
      const res = await request(app)
        .get('/api/conversations/search?q=Financial')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('GET /api/conversations/:id blocks access to owner conversation with 403', async () => {
      const res = await request(app)
        .get(`/api/conversations/${ownerConversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('GET /api/conversations/:id/messages blocks access to owner messages with 403', async () => {
      const res = await request(app)
        .get(`/api/conversations/${ownerConversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('POST /api/conversations blocks creating owner conversations with 403', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Guest Attempt' });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('PATCH /api/conversations/:id blocks renaming owner conversations with 403', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${ownerConversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Renamed By Guest' });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('DELETE /api/conversations/:id blocks deleting owner conversations with 403', async () => {
      const res = await request(app)
        .delete(`/api/conversations/${ownerConversationId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('GET /api/search returns 0 results in Guest Mode', async () => {
      const res = await request(app)
        .get('/api/search?q=Confidential')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
      expect(res.body.data.results).toEqual([]);
    });

    it('POST /api/search returns 0 results in Guest Mode', async () => {
      const res = await request(app)
        .post('/api/search')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ query: 'Confidential' });

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
      expect(res.body.data.results).toEqual([]);
    });

    it('GET /api/users/me returns sanitized Guest identity', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Guest');
      expect(res.body.data.email).toBe('');
      expect(res.body.data.isGuest).toBe(true);
    });

    it('PATCH /api/users/me blocks profile modification with 403', async () => {
      const res = await request(app)
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('POST /api/conversations/:ownerId/messages blocks posting to owner conversation with 403', async () => {
      const res = await request(app)
        .post(`/api/conversations/${ownerConversationId}/messages`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ content: 'Hello Owner', model: 'gemini-3.7-flash' });

      expect(res.status).toBe(403);
      expect(res.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });
  });

  describe('C. LLM Prompt Service Hard Purge in Guest Mode', () => {
    it('hard-purges memories, documents, and graphs when trustMode is GUEST', () => {
      const systemPrompt = buildSystemPromptWithKnowledge(
        [
          { type: 'USER_PREFERENCE', content: 'Owner secret bank pin is 1234' },
          { type: 'EPISODIC', content: 'Owner home address is 100 Main St' },
        ],
        [
          { documentTitle: 'Tax Return 2025.pdf', filename: 'tax.pdf', content: 'Net income $500,000' },
        ],
        [
          { sourceName: 'Owner', sourceType: 'Person', relationType: 'FAMILY', targetName: 'Secret Contact', targetType: 'Person' },
        ],
        'en',
        'conversational',
        undefined,
        'GUEST',
      );

      // Must NOT contain any of the owner memories, documents, or graph connections
      expect(systemPrompt).not.toContain('1234');
      expect(systemPrompt).not.toContain('100 Main St');
      expect(systemPrompt).not.toContain('Tax Return');
      expect(systemPrompt).not.toContain('500,000');
      expect(systemPrompt).not.toContain('Secret Contact');

      // Must explicitly enforce Guest isolation instructions
      expect(systemPrompt).toContain('GUEST MODE');
      expect(systemPrompt).toContain('CRITICAL PRIVACY DIRECTIVE');
    });

    it('preserves memories and documents when trustMode is OWNER', () => {
      const systemPrompt = buildSystemPromptWithKnowledge(
        [
          { type: 'USER_PREFERENCE', content: 'Owner favourite song is Hotel California' },
        ],
        [
          { documentTitle: 'Project Notes.md', filename: 'notes.md', content: 'Architecture design' },
        ],
        [
          { sourceName: 'Owner', sourceType: 'Person', relationType: 'WORKS_ON', targetName: 'TwinMind', targetType: 'Project' },
        ],
        'en',
        'conversational',
        undefined,
        'OWNER',
      );

      expect(systemPrompt).toContain('Hotel California');
      expect(systemPrompt).toContain('Project Notes.md');
      expect(systemPrompt).toContain('TwinMind');
    });
  });

  describe('D. Mode Re-elevation & Zero Data Loss Guarantee', () => {
    it('restores full Owner access and data intact after re-elevating to OWNER', async () => {
      // Re-elevate to OWNER
      await elevateToOwner();

      // Owner conversation must still be present and intact (NOT deleted)
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      const found = res.body.data.find((c: { id: string }) => c.id === ownerConversationId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Confidential Financial Strategy');

      // Profile is fully restored
      const profileRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.data.name).toBe('Private Owner');
      expect(profileRes.body.data.isGuest).toBe(false);
    });
  });
});
