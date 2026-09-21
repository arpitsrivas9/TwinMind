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
      expect(bypassRes.body.details?.mode).toBe('GUEST');
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
      expect(res.body.details?.mode).toBe('GUEST');
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

  describe('Owner Voice Identity & Biometric Verification', () => {
    // Helper to generate distinct synthetic acoustic buffers
    const createTestAudio = (sampleType: 'owner' | 'other' | 'silent', length = 1200, salt = 0) => {
      const buf = Buffer.alloc(length);
      for (let i = 0; i < length; i++) {
        if (sampleType === 'owner') {
          // 440Hz periodic oscillation
          buf[i] = Math.round(128 + 90 * Math.sin((2 * Math.PI * 440 * (i + salt)) / 8000));
        } else if (sampleType === 'other') {
          // 1200Hz periodic oscillation (different acoustic frequency profile)
          buf[i] = Math.round(128 + 90 * Math.sin((2 * Math.PI * 1200 * (i + salt)) / 8000));
        } else {
          // Flat/Silent
          buf[i] = 128;
        }
      }
      return buf;
    };

    it('should reject unauthenticated request to voice enrollment', async () => {
      const res = await request(app)
        .post('/api/trust/voice/enroll')
        .attach('audio', createTestAudio('owner'), 'voice.webm');

      expect(res.status).toBe(401);
    });

    it('should reject voice enrollment when user is in GUEST mode (strong auth required)', async () => {
      // Explicitly set session to GUEST mode to ensure strong auth is required
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      const res = await request(app)
        .post('/api/trust/voice/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', createTestAudio('owner'), 'voice.webm');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('strong owner authentication');
    });

    it('should reject voice enrollment if audio has zero dynamic range / is silent', async () => {
      // First elevate to Owner mode via OS Auth assertion
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      // Submit silent audio buffer
      const res = await request(app)
        .post('/api/trust/voice/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', createTestAudio('silent'), 'silent.webm');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should successfully enroll owner voice when in authenticated OWNER mode', async () => {
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      const audio = createTestAudio('owner', 1500);
      const res = await request(app)
        .post('/api/trust/voice/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', audio, 'owner_enroll.webm');

      if (res.status !== 201) console.error('ENROLL ERROR:', res.body);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrolled).toBe(true);
      // Zero biometric template or embedding leaked in response
      expect(res.body.data.template).toBeUndefined();
      expect(res.body.data.encryptedTemplate).toBeUndefined();

      // Verify status endpoint confirms enrollment
      const statusRes = await request(app)
        .get('/api/trust/voice/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.enrolled).toBe(true);
    });

    it('should verify owner voice match and elevate/maintain OWNER mode', async () => {
      // Switch session to GUEST to test elevation via voice
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      // Send owner-matching voice sample (with slight salt to simulate natural temporal offset without tripping replay)
      const matchingAudio = createTestAudio('owner', 1400, 15);
      const res = await request(app)
        .post('/api/trust/voice/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', matchingAudio, 'owner_verify.webm');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('OWNER');
      expect(res.body.data.trustScore).toBeGreaterThanOrEqual(85);
    });

    it('should detect non-owner speaker voice mismatch and demote session to GUEST mode', async () => {
      // Session is currently in OWNER mode
      // Different person speaks (1200Hz distinct acoustic profile)
      const otherPersonAudio = createTestAudio('other', 1400);
      const res = await request(app)
        .post('/api/trust/voice/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', otherPersonAudio, 'other_speaker.webm');

      // Voice mismatch must reject and force GUEST mode
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.details?.mode).toBe('GUEST');

      // Verify trust status is now demoted to GUEST
      const statusRes = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusRes.body.data.mode).toBe('GUEST');
    });

    it('should protect private memories, documents, and graph when voice mismatch has demoted session', async () => {
      // Session was demoted to GUEST by the previous voice mismatch
      const memRes = await request(app)
        .get('/api/memories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(memRes.status).toBe(403);
      expect(memRes.body.details?.code).toBe('GUEST_MODE_RESTRICTED');

      const docRes = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${userToken}`);
      expect(docRes.status).toBe(403);
      expect(docRes.body.details?.code).toBe('GUEST_MODE_RESTRICTED');

      const graphRes = await request(app)
        .get('/api/graph/entities')
        .set('Authorization', `Bearer ${userToken}`);
      expect(graphRes.status).toBe(403);
      expect(graphRes.body.details?.code).toBe('GUEST_MODE_RESTRICTED');
    });

    it('should detect and reject replay attacks using identical audio buffer', async () => {
      const replayAudio = createTestAudio('owner', 1300, 42);

      // First submission (normal attempt)
      await request(app)
        .post('/api/trust/voice/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', replayAudio, 'replay_test.webm');

      // Second submission with exact same byte-for-byte buffer -> Replay Attack detected
      const replayRes = await request(app)
        .post('/api/trust/voice/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', replayAudio, 'replay_test.webm');

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.error).toContain('replay attack');
    });

    it('should prevent Guest user from revoking owner voice (403)', async () => {
      // Explicitly switch to GUEST mode
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      const revokeRes = await request(app)
        .delete('/api/trust/voice/enrollment')
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(403);
    });

    it('should allow verified Owner to revoke voice profile and clear enrollment', async () => {
      // Re-elevate to Owner via OS Auth
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      // Revoke voice profile
      const revokeRes = await request(app)
        .delete('/api/trust/voice/enrollment')
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Status endpoint should now report not enrolled
      const statusRes = await request(app)
        .get('/api/trust/voice/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusRes.body.data.enrolled).toBe(false);

      // Subsequent voice verification should return not enrolled
      const verifyRes = await request(app)
        .post('/api/trust/voice/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('audio', createTestAudio('owner', 1000, 99), 'unregistered.webm');

      expect(verifyRes.status).toBe(401);
      expect(verifyRes.body.error).toContain('No enrolled voice biometric profile');
    });
  });

  describe('Face & Liveness Biometric Verification & Protection', () => {
    function createTestFaceMatrix(type: 'owner' | 'other' | 'flat', seed = 0): string {
      const bytes = Buffer.alloc(1024);
      if (type === 'flat') {
        bytes.fill(128); // variance = 0, dynamicRange = 0 -> rejected for poor lighting
        return bytes.toString('base64');
      }

      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = y * 32 + x;
          if (type === 'owner') {
            const eyeZone = y >= 8 && y <= 14 ? 40 : 160;
            const noseZone = x >= 14 && x <= 18 && y >= 14 && y <= 22 ? 200 : 150;
            const cheekZone = x < 10 || x > 22 ? 110 : 170;
            const noise = (seed % 8) + ((x * 3 + y * 7) % 12);
            bytes[idx] = Math.max(10, Math.min(245, Math.round((eyeZone + noseZone + cheekZone) / 3) + noise));
          } else {
            const vertBars = x % 8 < 4 ? 40 : 220;
            const horizBars = y % 8 < 4 ? 50 : 210;
            bytes[idx] = Math.max(10, Math.min(245, Math.round((vertBars + horizBars) / 2) + (seed % 10)));
          }
        }
      }

      return bytes.toString('base64');
    }

    function createTestLivenessFrames(): [string, string] {
      const f1Bytes = Buffer.from(createTestFaceMatrix('owner', 10), 'base64');
      const f2Bytes = Buffer.from(createTestFaceMatrix('owner', 25), 'base64');

      // Add gentle live motion (shift values slightly so pixel difference is ~6-8%)
      for (let i = 0; i < 1024; i++) {
        const delta = (i % 2 === 0 ? 1 : -1) * (12 + (i % 8));
        f2Bytes[i] = Math.max(10, Math.min(245, f2Bytes[i] + delta));
      }

      return [f1Bytes.toString('base64'), f2Bytes.toString('base64')];
    }

    it('should report face status as not enrolled initially', async () => {
      const res = await request(app)
        .get('/api/trust/face/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrolled).toBe(false);
      expect(res.body.data).toHaveProperty('providerStatus');
    });

    it('should reject unauthenticated request to face enrollment', async () => {
      const res = await request(app)
        .post('/api/trust/face/enroll')
        .send({ imageBase64: createTestFaceMatrix('owner') });

      expect(res.status).toBe(401);
    });

    it('should reject face enrollment when user is in GUEST mode (strong auth required)', async () => {
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      const res = await request(app)
        .post('/api/trust/face/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageBase64: createTestFaceMatrix('owner') });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('strong owner authentication');
    });

    it('should reject face enrollment if image has flat lighting or zero contrast', async () => {
      // Elevate to OWNER mode
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      const res = await request(app)
        .post('/api/trust/face/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageBase64: createTestFaceMatrix('flat') });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('lighting');
    });

    it('should successfully enroll owner face when in authenticated OWNER mode', async () => {
      const enrollImage = createTestFaceMatrix('owner', 5);
      const res = await request(app)
        .post('/api/trust/face/enroll')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageBase64: enrollImage });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enrolled).toBe(true);
      expect(res.body.data.template).toBeUndefined(); // Zero plaintext embedding leakage
    });

    it('should report enrolled: true in face status after enrollment', async () => {
      const res = await request(app)
        .get('/api/trust/face/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.enrolled).toBe(true);
    });

    it('should detect static photo spoofing and reject frozen frames', async () => {
      const staticFrame = createTestFaceMatrix('owner', 8);

      const res = await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          imageBase64: staticFrame,
          livenessFrames: [staticFrame, staticFrame], // Identical frames = static photo
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Static photo');
    });

    it('should verify matching owner face with live biological motion and elevate to OWNER mode', async () => {
      // Put into GUEST mode first
      await request(app)
        .post('/api/trust/mode')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ mode: 'GUEST' });

      const queryFace = createTestFaceMatrix('owner', 12);
      const livenessFrames = createTestLivenessFrames();

      const res = await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          imageBase64: queryFace,
          livenessFrames,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('OWNER');
      expect(res.body.data.trustScore).toBeGreaterThanOrEqual(85);
    });

    it('should detect and reject replay attacks using identical face image buffer', async () => {
      const replayFrame = createTestFaceMatrix('owner', 33);
      const livenessFrames = createTestLivenessFrames();

      // First attempt
      await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageBase64: replayFrame, livenessFrames });

      // Immediate replay with exact same frame
      const replayRes = await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ imageBase64: replayFrame, livenessFrames });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.error).toContain('replay attack');
    });

    it('should detect non-owner face mismatch and demote session to GUEST mode', async () => {
      // Ensure in OWNER mode first
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      // Different person appears before camera
      const otherFace = createTestFaceMatrix('other', 50);
      const livenessFrames = createTestLivenessFrames();

      const res = await request(app)
        .post('/api/trust/face/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          imageBase64: otherFace,
          livenessFrames,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.details?.mode).toBe('GUEST');

      // Check trust status: session demoted to GUEST
      const statusRes = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusRes.body.data.mode).toBe('GUEST');
      expect(statusRes.body.data.trustScore).toBeLessThanOrEqual(35);
    });

    it('should block Guest user from revoking owner face template (403)', async () => {
      const revokeRes = await request(app)
        .delete('/api/trust/face/enrollment')
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(403);
    });

    it('should allow verified Owner to revoke face template and clear enrollment', async () => {
      // Elevate to OWNER mode
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      // Revoke face template
      const revokeRes = await request(app)
        .delete('/api/trust/face/enrollment')
        .set('Authorization', `Bearer ${userToken}`);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);

      // Verify status is unenrolled
      const statusRes = await request(app)
        .get('/api/trust/face/status')
        .set('Authorization', `Bearer ${userToken}`);

      expect(statusRes.body.data.enrolled).toBe(false);
    });
  });

  describe('POST /api/trust/evaluate-presence (Multimodal Presence Decision Endpoint)', () => {
    it('MUST switch to GUEST when non-owner speaks even if Owner face is visible (Case B)', async () => {
      // First ensure session is elevated to OWNER
      const challengeRes = await request(app)
        .post('/api/trust/os-auth/challenge')
        .set('Authorization', `Bearer ${userToken}`);
      await request(app)
        .post('/api/trust/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          method: 'OS_AUTH',
          challengeResponse: createAssertionPayload(challengeRes.body.data.challenge),
        });

      // Call evaluate-presence with OWNER_FACE but NON_OWNER_VOICE
      const res = await request(app)
        .post('/api/trust/evaluate-presence')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          cameraEvidence: 'OWNER_FACE',
          voiceEvidence: 'NON_OWNER_VOICE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('GUEST');

      // Verify session is now GUEST on subsequent requests
      const statusRes = await request(app)
        .get('/api/trust/status')
        .set('Authorization', `Bearer ${userToken}`);
      expect(statusRes.body.data.mode).toBe('GUEST');
    });

    it('should restore OWNER mode when Owner voice is verified with NO_FACE (Case C & G)', async () => {
      const res = await request(app)
        .post('/api/trust/evaluate-presence')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          cameraEvidence: 'NO_FACE',
          voiceEvidence: 'OWNER_VOICE',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('OWNER');
    });

    it('should NOT demote Owner session merely because camera has NO_FACE and voice is NO_SPEECH (Case E)', async () => {
      const res = await request(app)
        .post('/api/trust/evaluate-presence')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          cameraEvidence: 'NO_FACE',
          voiceEvidence: 'NO_SPEECH',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.mode).toBe('OWNER');
    });

    it('should reject invalid evidence enum values with 400', async () => {
      const res = await request(app)
        .post('/api/trust/evaluate-presence')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          cameraEvidence: 'INVALID_CAMERA',
          voiceEvidence: 'NO_SPEECH',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});
