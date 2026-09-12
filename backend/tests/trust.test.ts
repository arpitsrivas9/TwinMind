import request from 'supertest';
import app from '../src/app';

describe('TwinTrust™ Security & Trust API', () => {
  let userToken: string;
  let otherUserToken: string;

  beforeAll(async () => {
    // Register primary test user
    const userRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Trust Owner',
        email: `trust_owner_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    userToken = userRes.body.data.token;

    // Register secondary test user for IDOR testing
    const otherRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Other User',
        email: `trust_other_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    otherUserToken = otherRes.body.data.token;
  });

  const createAssertionPayload = (challenge: string, type: 'webauthn.get' | 'webauthn.create' = 'webauthn.get') => {
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type,
        challenge,
        origin: 'http://localhost:3000',
      }),
    ).toString('base64');
    return JSON.stringify({
      credentialId: 'cred_test_assertion_123',
      clientDataJSON,
      signature: Buffer.from('mock_signature').toString('base64'),
      authenticatorData: Buffer.from('mock_auth_data').toString('base64'),
    });
  };

  describe('Authentication & Trust Status', () => {
    it('should reject unauthenticated requests to trust status', async () => {
      const res = await request(app).get('/api/trust/status');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return initial guest status for authenticated user prior to biometric verification', async () => {
      const res = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('GUEST');
      expect(res.body.data.trustScore).toBeLessThan(75);
      expect(res.body.data).toHaveProperty('privacyShieldActive', false);
      expect(res.body.data.breakdown).toHaveProperty('score');
      expect(res.body.data.breakdown).toHaveProperty('reasons');
    });

    it('should block unauthorized mode switch to OWNER without biometric verification', async () => {
      const switchRes = await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'OWNER' });

      expect(switchRes.status).toBe(200);
      // Backend must strictly force GUEST mode when trust confidence is insufficient
      expect(switchRes.body.data.mode).toBe('GUEST');
    });
  });

  describe('WebAuthn OS Authentication & Verification (Anti-Bypass)', () => {
    it('should generate an OS Auth challenge', async () => {
      const res = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('challenge');
      expect(typeof res.body.data.challenge).toBe('string');
    });

    it('should reject invalid verification payload method', async () => {
      const res = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ method: 'INVALID_METHOD' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should REJECT OS_AUTH when plain challenge string is passed without WebAuthn assertion (anti-bypass)', async () => {
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      const challenge = challengeRes.body.data.challenge;

      // Attacker attempts to bypass by merely reflecting the challenge string
      const bypassRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: challenge,
        });

      expect(bypassRes.status).toBe(401);
      expect(bypassRes.body.success).toBe(false);
      expect(bypassRes.body.details.mode).toBe('GUEST');
    });

    it('should REJECT OS_AUTH when challenge is mismatched or forged', async () => {
      await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      const forgedPayload = createAssertionPayload('wrong_fake_challenge_value');

      const res = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: forgedPayload,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.details.mode).toBe('GUEST');
    });

    it('should REJECT replay attacks when the same WebAuthn assertion is sent twice', async () => {
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      const challenge = challengeRes.body.data.challenge;
      const assertion = createAssertionPayload(challenge);

      // First use: valid
      const firstRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: assertion,
        });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.mode).toBe('OWNER');

      // Second use (replay attack): must be rejected with 401
      const replayRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: assertion,
        });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
    });

    it('should verify OS_AUTH with genuine WebAuthn assertion and elevate to owner status', async () => {
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      const challenge = challengeRes.body.data.challenge;
      const assertion = createAssertionPayload(challenge);

      const verifyRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: assertion,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.success).toBe(true);
      expect(verifyRes.body.data.mode).toBe('OWNER');
    });
  });

  describe('Trust Modes & Route Boundary Enforcement', () => {
    it('should switch to Guest Mode and restrict private memory and graph access', async () => {
      // 1. Switch to GUEST mode
      const modeRes = await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      expect(modeRes.status).toBe(200);
      expect(modeRes.body.data.mode).toBe('GUEST');

      // 2. Status should reflect GUEST
      const statusRes = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);
      expect(statusRes.body.data.mode).toBe('GUEST');

      // 3. Memory access should be blocked in GUEST mode (403)
      const memoryRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memoryRes.status).toBe(403);
      expect(memoryRes.body.details.code).toBe('GUEST_MODE_RESTRICTED');

      // 4. Graph overview should be blocked in GUEST mode (403)
      const graphRes = await request(app)
        .get('/api/graph/overview')
        .set('Authorization', `Bearer ${userToken}`);
      expect(graphRes.status).toBe(403);
      expect(graphRes.body.details.code).toBe('GUEST_MODE_RESTRICTED');

      // 5. Documents list should be blocked in GUEST mode (403)
      const docRes = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${userToken}`);
      expect(docRes.status).toBe(403);
      expect(docRes.body.details.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('should lock TwinMind and block protected endpoints with 423 Locked', async () => {
      // 1. Lock TwinMind
      const lockRes = await request(app)
        .post('/api/trust/lock')
        .set('Authorization', `Bearer ${userToken}`);

      expect(lockRes.status).toBe(200);
      expect(lockRes.body.data.mode).toBe('LOCKED');
      expect(lockRes.body.data.trustScore).toBe(0);

      // 2. Memory access should return 423
      const memRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memRes.status).toBe(423);
      expect(memRes.body.details.code).toBe('TWINMIND_LOCKED');

      // 3. Unlock with genuine WebAuthn verification
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      const challenge = challengeRes.body.data.challenge;
      const assertion = createAssertionPayload(challenge);

      const unlockRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: assertion,
        });

      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.data.mode).toBe('OWNER');

      // 4. Memory access should now succeed
      const memAfterRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memAfterRes.status).toBe(200);
    });
  });

  describe('Privacy Shield', () => {
    it('should toggle privacy shield on and off', async () => {
      const res1 = await request(app)
        .post('/api/trust/privacy-shield')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.privacyShieldActive).toBe(true);

      const res2 = await request(app)
        .post('/api/trust/privacy-shield')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.privacyShieldActive).toBe(false);
    });
  });

  describe('Trusted Devices & IDOR Protection', () => {
    it('should list trusted devices and register a new device', async () => {
      // Register new device
      const regRes = await request(app)
        .post('/api/trust/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ label: 'Owner Workstation' });

      expect(regRes.status).toBe(201);
      expect(regRes.body.data.label).toBe('Owner Workstation');
      expect(regRes.body.data.isTrusted).toBe(true);

      // List devices
      const listRes = await request(app)
        .get('/api/trust/devices')
        .set('Authorization', `Bearer ${userToken}`);

      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.data.some((d: { label: string }) => d.label === 'Owner Workstation')).toBe(true);
    });

    it('should prevent IDOR when attempting to revoke another user device', async () => {
      // Other user registers a device
      const regOther = await request(app)
        .post('/api/trust/devices/register')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({ label: 'Other Device' });

      const otherDeviceId = regOther.body.data.id;

      // Primary user tries to revoke other user's device -> 404 (IDOR blocked)
      const revokeRes = await request(app)
        .delete(`/api/trust/devices/${otherDeviceId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(404);
    });
  });

  describe('Security Audit Logs', () => {
    it('should record security audit log entries for trust actions', async () => {
      const logsRes = await request(app)
        .get('/api/trust/audit-logs')
        .set('Authorization', `Bearer ${userToken}`);

      expect(logsRes.status).toBe(200);
      expect(Array.isArray(logsRes.body.data)).toBe(true);
      expect(logsRes.body.data.length).toBeGreaterThan(0);
      const actions = logsRes.body.data.map((l: { action: string }) => l.action);
      expect(actions).toContain('GUEST_MODE_ACTIVATED');
    });
  });
});
