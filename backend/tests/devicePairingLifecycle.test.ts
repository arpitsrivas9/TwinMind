import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/lib/prisma';
import { deviceService } from '../src/services/deviceService';

describe('Phase 9: Device Pairing Lifecycle & Management Tests', () => {
  let userToken: string;
  let userId: string;
  let hostDeviceId: string;

  beforeAll(async () => {
    // 1. Signup to obtain test token
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Pairing Lifecycle Owner',
        email: `pairing_owner_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    expect(signupRes.status).toBe(201);
    userToken = signupRes.body.data.token;
    userId = signupRes.body.data.user.id;

    // 2. Register initial host laptop
    const regRes = await request(app)
      .post('/api/devices/register')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        label: "Arpit's Primary Laptop",
        type: 'LAPTOP',
        platformInfo: { os: 'Windows 11', browser: 'Chrome' },
      });
    expect(regRes.status).toBe(200);
    hostDeviceId = regRes.body.data.id;
  });

  afterAll(async () => {
    deviceService.destroy();
  });

  describe('1. Pairing Initiation', () => {
    it('generates a 6-digit numeric PIN, QR payload, and 10-minute expiry', async () => {
      const res = await request(app)
        .post('/api/devices/pairing/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hostDeviceId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const session = res.body.data;
      expect(session.id).toBeDefined();
      expect(session.pairingCode).toMatch(/^\d{3}-\d{3}$/);
      expect(session.status).toBe('INITIATED');
      expect(session.qrPayload).toBeDefined();

      const qr = JSON.parse(session.qrPayload);
      expect(qr.twinmindPairing).toBe(true);
      expect(qr.pairingCode).toBe(session.pairingCode);
      expect(qr.expiresAt).toBeDefined();

      const expiryDiffMs = new Date(session.expiresAt).getTime() - Date.now();
      expect(expiryDiffMs).toBeGreaterThan(9 * 60 * 1000);
      expect(expiryDiffMs).toBeLessThanOrEqual(10 * 60 * 1000 + 5000);
    });
  });

  describe('2. Pairing Join & Pending Approval', () => {
    it('allows a secondary phone to join pairing with 6-digit PIN', async () => {
      // Initiate
      const initRes = await request(app)
        .post('/api/devices/pairing/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hostDeviceId });
      const session = initRes.body.data;

      // Join from Phone
      const joinRes = await request(app)
        .post('/api/devices/pairing/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          pairingCode: session.pairingCode,
          candidateDevice: {
            label: "Arpit's Pixel Phone",
            type: 'PHONE',
            platformInfo: { os: 'Android 14', browser: 'Chrome Mobile' },
          },
        });

      expect(joinRes.status).toBe(200);
      expect(joinRes.body.success).toBe(true);
      expect(joinRes.body.data.status).toBe('PENDING_APPROVAL');

      // Check status via polling
      const pollRes = await request(app)
        .get(`/api/devices/pairing/${session.id}/status`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.data.status).toBe('PENDING_APPROVAL');
    });

    it('rejects pairing join if PIN is invalid or expired', async () => {
      const joinRes = await request(app)
        .post('/api/devices/pairing/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          pairingCode: '999-999',
          candidateDevice: {
            label: 'Unknown Device',
            type: 'TABLET',
          },
        });

      expect(joinRes.status).toBe(400);
      expect(joinRes.body.success).toBe(false);
    });
  });

  describe('3. Owner Approval Workflow', () => {
    it('approves a pending device, creates TrustedDevice, and grants deviceToken', async () => {
      // 1. Initiate
      const initRes = await request(app)
        .post('/api/devices/pairing/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hostDeviceId });
      const session = initRes.body.data;

      // 2. Join
      await request(app)
        .post('/api/devices/pairing/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          pairingCode: session.pairingCode,
          candidateDevice: {
            label: "Arpit's iPad Tablet",
            type: 'TABLET',
            platformInfo: { os: 'iPadOS 17', browser: 'Safari' },
          },
        });

      // 3. Host approves in Owner Mode
      const approveRes = await request(app)
        .post(`/api/devices/pairing/${session.id}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({});

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);

      const { device, token } = approveRes.body.data;
      expect(device.label).toBe("Arpit's iPad Tablet");
      expect(device.type).toBe('TABLET');
      expect(device.status).toBe('TRUSTED');
      expect(device.isTrusted).toBe(true);
      expect(device.connectionMethod).toBe('QR_PIN');
      expect(token).toMatch(/^dvt_/);

      // Verify polling returns APPROVED and registered device
      const pollRes = await request(app)
        .get(`/api/devices/pairing/${session.id}/status`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.data.status).toBe('APPROVED');
      expect(pollRes.body.data.device.id).toBe(device.id);
    });

    it('blocks approval if request is from Guest Mode', async () => {
      const initRes = await request(app)
        .post('/api/devices/pairing/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hostDeviceId });
      const session = initRes.body.data;

      await request(app)
        .post('/api/devices/pairing/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          pairingCode: session.pairingCode,
          candidateDevice: {
            label: 'Test Device',
            type: 'PHONE',
          },
        });

      const guestApproveRes = await request(app)
        .post(`/api/devices/pairing/${session.id}/approve`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'GUEST')
        .send({});

      expect(guestApproveRes.status).toBe(403);
    });
  });

  describe('4. Owner Rejection Workflow', () => {
    it('allows Owner to reject incoming pairing request', async () => {
      const initRes = await request(app)
        .post('/api/devices/pairing/initiate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ hostDeviceId });
      const session = initRes.body.data;

      await request(app)
        .post('/api/devices/pairing/join')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          pairingCode: session.pairingCode,
          candidateDevice: {
            label: 'Unwanted Stranger Device',
            type: 'PHONE',
          },
        });

      const rejectRes = await request(app)
        .post(`/api/devices/pairing/${session.id}/reject`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({});

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.success).toBe(true);

      const pollRes = await request(app)
        .get(`/api/devices/pairing/${session.id}/status`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(pollRes.status).toBe(200);
      expect(pollRes.body.data.status).toBe('REJECTED');
    });
  });

  describe('5. Device Management: Disconnect, Unpair, Forget, Delete', () => {
    let testDeviceId: string;

    beforeEach(async () => {
      const reg = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          label: 'Manageable Test Device',
          type: 'DESKTOP',
        });
      testDeviceId = reg.body.data.id;
    });

    it('disconnects device temporarily', async () => {
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/disconnect`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const getRes = await request(app)
        .get(`/api/devices/${testDeviceId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(getRes.body.data.presence).toBe('OFFLINE');
    });

    it('unpairs device and invalidates active session/token', async () => {
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/unpair`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNPAIRED');
      expect(res.body.data.isTrusted).toBe(false);
      expect(res.body.data.unpairedAt).toBeDefined();
    });

    it('forgets device and revokes credentials completely', async () => {
      const res = await request(app)
        .post(`/api/devices/${testDeviceId}/forget`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REVOKED');
      expect(res.body.data.isTrusted).toBe(false);
      expect(res.body.data.revokedAt).toBeDefined();
    });

    it('deletes device permanently from database', async () => {
      const res = await request(app)
        .delete(`/api/devices/${testDeviceId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const getRes = await request(app)
        .get(`/api/devices/${testDeviceId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(getRes.status).toBe(404);
    });
  });
});
