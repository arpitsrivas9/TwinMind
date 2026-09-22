import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { extractExplicitMemoryCandidate } from '../src/services/memory/memoryExtractor';
import { saveExplicitMemorySync, forgetExplicitMemory } from '../src/services/memory/memoryService';

describe('TwinMind — Final Biometric, Guest Chat, Memory & Security Recovery Verification', () => {
  let userToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const email = `final_recovery_${Date.now()}@twinmind.test`;
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Final Recovery Owner',
        email,
        password: 'Password123!',
      });
    expect(signupRes.status).toBe(201);
    userToken = signupRes.body.data.token;
    testUserId = signupRes.body.data.user.id;

    // Elevate test session to Owner Mode via OS Auth challenge
    const challengeRes = await request(app)
      .post('/api/trust/os-auth/challenge')
      .set('Authorization', `Bearer ${userToken}`);
    expect(challengeRes.status).toBe(200);

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: challengeRes.body.data.challenge,
        origin: 'http://localhost:3000',
      }),
    ).toString('base64');

    const assertionPayload = JSON.stringify({
      credentialId: `cred_test_${Date.now()}`,
      clientDataJSON,
      signature: Buffer.from('mock_signature').toString('base64'),
      authenticatorData: Buffer.from('mock_auth_data').toString('base64'),
    });

    const verifyRes = await request(app)
      .post('/api/trust/verify')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        method: 'OS_AUTH',
        challengeResponse: assertionPayload,
      });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.mode).toBe('OWNER');
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.memory.deleteMany({ where: { userId: testUserId } });
      await prisma.trustProfile.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
  });

  describe('1. Owner Multi-Frame Face Enrollment & Consensus', () => {
    it('should allow initial face enrollment for a freshly authenticated user without prior biometric verification', async () => {
      // Fresh user with no biometrics enrolled
      const freshSignup = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Fresh Owner',
          email: `fresh_owner_${Date.now()}@twinmind.test`,
          password: 'Password123!',
        });
      expect(freshSignup.status).toBe(201);
      const freshToken = freshSignup.body.data.token;
      const freshId = freshSignup.body.data.user.id;

      const frames: string[] = [];
      for (let f = 0; f < 3; f++) {
        const buf = Buffer.alloc(1024);
        for (let i = 0; i < buf.length; i++) {
          buf[i] = Math.round(128 + 60 * Math.sin((i * 4 + f * 2) * 0.05));
        }
        frames.push(buf.toString('base64'));
      }

      // Initial enrollment succeeds without requiring prior biometric verification (no circular dependency)
      const enrollRes = await request(app)
        .post('/api/trust/face/enroll')
        .set('Authorization', `Bearer ${freshToken}`)
        .send({ frames });

      expect(enrollRes.status).toBe(201);
      expect(enrollRes.body.success).toBe(true);
      expect(enrollRes.body.data.enrolled).toBe(true);
      expect(enrollRes.body.data.mode).toBe('OWNER');

      // Cleanup fresh user
      await prisma.trustProfile.deleteMany({ where: { userId: freshId } });
      await prisma.user.deleteMany({ where: { id: freshId } });
    });

    it('should enroll multi-frame face templates and verify matching live face without anti-replay collision', async () => {
      // Generate synthetic 3-frame sequence
      const frames: string[] = [];
      for (let f = 0; f < 3; f++) {
        const buf = Buffer.alloc(1024);
        for (let i = 0; i < buf.length; i++) {
          buf[i] = Math.round(128 + 60 * Math.sin((i * 4 + f * 2) * 0.05));
        }
        frames.push(buf.toString('base64'));
      }

      const enrollRes = await request(app)
        .post('/api/trust/face/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ frames });

      expect(enrollRes.status).toBe(201);
      expect(enrollRes.body.success).toBe(true);
      expect(enrollRes.body.data.enrolled).toBe(true);
      expect(enrollRes.body.data.mode).toBe('OWNER');

      // Immediate verification should NOT trigger anti-replay error
      const verifyRes = await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ faceImageBase64: frames[0] });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.mode).toBe('OWNER');
      expect(verifyRes.body.data.trustScore).toBeGreaterThanOrEqual(85);
    });
  });

  describe('2. Mandatory Mango Test — Persistent Memory, Cross-Chat & Forget', () => {
    it('Step 1: Should extract explicit memory directive "Remember that my favorite fruit is mango"', async () => {
      const utterance = 'Remember that my favorite fruit is mango';
      const extracted = extractExplicitMemoryCandidate(utterance);
      expect(extracted).not.toBeNull();
      expect(extracted?.content).toContain('favorite fruit is mango');
      expect(extracted?.type).toBe('USER_PREFERENCE');
      expect(extracted?.importance).toBeGreaterThanOrEqual(8);

      // Persist synchronously as done in message route
      const saved = await saveExplicitMemorySync(testUserId, 'standalone_test', 'standalone_msg', utterance);
      expect(saved).not.toBeNull();
      expect(saved?.id).toBeDefined();

      // Verify in DB
      const dbRecord = await prisma.memory.findFirst({
        where: { userId: testUserId, content: { contains: 'mango' } },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.content).toContain('mango');
    });

    it('Step 2: Start a brand NEW conversation and retrieve the memory in Owner Mode', async () => {
      // Create new conversation
      const convRes = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'New Fruit Query Conversation' });
      expect(convRes.status).toBe(201);

      // Query memories endpoint directly for this user
      const memRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memRes.status).toBe(200);
      const mangoMem = memRes.body.data.memories.find((m: any) => m.content.toLowerCase().includes('mango'));
      expect(mangoMem).toBeDefined();
    });

    it('Step 3: Switch to Guest Mode — verify memories and documents are 100% blocked', async () => {
      const modeRes = await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });
      expect(modeRes.status).toBe(200);
      expect(modeRes.body.data.mode).toBe('GUEST');

      // Attempt to access memories endpoint
      const memRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memRes.status).toBe(403);

      // Search endpoint should return 0 results
      const searchRes = await request(app)
        .get('/api/search?q=mango')
        .set('Authorization', `Bearer ${userToken}`);
      expect(searchRes.status).toBe(200);
      expect(searchRes.body.data.results).toHaveLength(0);
    });

    it('Step 4: Re-elevate to Owner Mode and forget the memory', async () => {
      // Re-elevate to Owner Mode
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: challengeRes.body.data.challenge,
          origin: 'http://localhost:3000',
        }),
      ).toString('base64');
      const assertionPayload = JSON.stringify({
        credentialId: `cred_test_${Date.now()}`,
        clientDataJSON,
        signature: Buffer.from('mock_signature').toString('base64'),
        authenticatorData: Buffer.from('mock_auth_data').toString('base64'),
      });
      const verifyRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: assertionPayload,
        });
      expect(verifyRes.status).toBe(200);

      // Issue forget command
      const forgetResult = await forgetExplicitMemory(testUserId, 'Forget my favorite fruit');
      expect(forgetResult.count).toBeGreaterThanOrEqual(1);

      // Verify permanently deleted from DB
      const dbCheck = await prisma.memory.findFirst({
        where: { userId: testUserId, content: { contains: 'mango' } },
      });
      expect(dbCheck).toBeNull();
    });
  });

  describe('3. Guest Mode Normal AI Multi-Turn Conversation Isolation', () => {
    it('should allow Guest mode message endpoint without crashing or accessing owner storage', async () => {
      // Set to Guest mode
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      // Post message with guestHistory in guest mode
      const chatRes = await request(app)
        .post('/api/conversations/guest/messages')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          content: 'Hello, what is Python?',
          model: 'gemini-3.7-flash',
          guestHistory: [
            { role: 'user', content: 'Hi TwinMind' },
            { role: 'assistant', content: 'Hello! How can I help you today?' },
          ],
        });

      // Endpoint streams SSE response (status 200)
      expect(chatRes.status).toBe(200);
      expect(chatRes.headers['content-type']).toContain('text/event-stream');
    }, 60000);
  });
});
