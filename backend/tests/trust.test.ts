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

  describe('Authentication & Trust Status', () => {
    it('should reject unauthenticated requests to trust status', async () => {
      const res = await request(app).get('/api/trust/status');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return default owner status and score breakdown for authenticated user', async () => {
      const res = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('mode');
      expect(res.body.data).toHaveProperty('trustScore');
      expect(res.body.data).toHaveProperty('privacyShieldActive', false);
      expect(res.body.data.breakdown).toHaveProperty('score');
      expect(res.body.data.breakdown).toHaveProperty('reasons');
    });
  });

  describe('WebAuthn OS Authentication & Verification', () => {
    it('should generate an OS Auth challenge', async () => {
      const res = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('challenge');
      expect(typeof res.body.data.challenge).toBe('string');
    });

    it('should reject invalid verification payload', async () => {
      const res = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ method: 'INVALID_METHOD' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should verify OS_AUTH and elevate/confirm owner status', async () => {
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);

      const challenge = challengeRes.body.data.challenge;

      const verifyRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: challenge,
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

      // 3. Unlock with verification
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      const challenge = challengeRes.body.data.challenge;

      const unlockRes = await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: challenge,
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
