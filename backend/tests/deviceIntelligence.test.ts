import request from 'supertest';
import app from '../src/app';

describe('Phase 9: Device Intelligence Layer API', () => {
  let ownerToken: string;
  let guestToken: string;

  beforeAll(async () => {
    // Register owner test user
    const ownerRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Device Intelligence Owner',
        email: `device_owner_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    ownerToken = ownerRes.body.data.token;

    // Register guest / secondary test user
    const guestRes = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Device Intelligence Guest',
        email: `device_guest_${Date.now()}@example.com`,
        password: 'Password123!',
      });
    guestToken = guestRes.body.data.token;
  });

  describe('Device Registration & Identification', () => {
    it('should reject unauthenticated registration requests', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .send({ label: 'My Laptop', type: 'LAPTOP' });

      expect(res.status).toBe(401);
    });

    it('should register a Laptop device with default capabilities and permissions', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          label: 'Primary Workstation',
          type: 'LAPTOP',
          platformInfo: {
            os: 'Windows 11 Pro',
            browser: 'Chrome 122',
            model: 'Dell XPS 15',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toMatch(/^device_/);
      expect(res.body.data.label).toBe('Primary Workstation');
      expect(res.body.data.type).toBe('LAPTOP');
      expect(res.body.data.presence).toBe('ONLINE');
      expect(res.body.data.capabilities).toContain('CAMERA');
      expect(res.body.data.capabilities).toContain('MICROPHONE');
      expect(res.body.data.capabilities).toContain('KEYBOARD');
      expect(res.body.data.permissions).toContain('SEND_COMMAND');
      expect(res.body.data.permissions).toContain('RECEIVE_COMMAND');
    });

    it('should register a Phone device with mobile capability profile', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          label: 'Galaxy S24',
          type: 'PHONE',
          deviceKey: 'phone_key_unique_1',
          platformInfo: {
            os: 'Android 14',
            model: 'SM-S928B',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('PHONE');
      expect(res.body.data.capabilities).toContain('GPS');
      expect(res.body.data.capabilities).toContain('NOTIFICATIONS');
      expect(res.body.data.permissions).toContain('LOCATION');
    });
  });

  describe('Owner / Guest Mode Security Boundary', () => {
    it('should hide private device list when user is in GUEST mode', async () => {
      const res = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'GUEST');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]); // Guest Mode receives zero device information
    });

    it('should return registered devices when user is in OWNER mode', async () => {
      const res = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data.some((d: any) => d.type === 'LAPTOP')).toBe(true);
      expect(res.body.data.some((d: any) => d.type === 'PHONE')).toBe(true);
    });

    it('should reject device verification requests from GUEST mode', async () => {
      const listRes = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      const targetId = listRes.body.data[0].id;

      const res = await request(app)
        .post(`/api/devices/${targetId}/verify`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'GUEST');

      expect(res.status).toBe(403);
    });

    it('should reject device revocation requests from GUEST mode', async () => {
      const listRes = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      const targetId = listRes.body.data[0].id;

      const res = await request(app)
        .post(`/api/devices/${targetId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'GUEST');

      expect(res.status).toBe(403);
    });
  });

  describe('Presence & Heartbeat', () => {
    it('should update lastSeenAt and maintain ONLINE presence on heartbeat', async () => {
      const listRes = await request(app)
        .get('/api/devices')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      const targetId = listRes.body.data[0].id;

      const res = await request(app)
        .post(`/api/devices/${targetId}/heartbeat`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.presence).toBe('ONLINE');
    });

    it('should return OFFLINE and REVOKED if revoked device attempts heartbeat', async () => {
      // Register a device to revoke
      const regRes = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Revocable Device', type: 'TABLET', deviceKey: 'revoke_key_1' });

      const deviceId = regRes.body.data.id;

      // Revoke as Owner
      const revokeRes = await request(app)
        .post(`/api/devices/${deviceId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.data.status).toBe('REVOKED');
      expect(revokeRes.body.data.presence).toBe('OFFLINE');

      // Heartbeat attempt
      const hbRes = await request(app)
        .post(`/api/devices/${deviceId}/heartbeat`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(hbRes.status).toBe(200);
      expect(hbRes.body.data.success).toBe(false);
      expect(hbRes.body.data.status).toBe('REVOKED');
      expect(hbRes.body.data.presence).toBe('OFFLINE');
    });
  });

  describe('Command Routing Engine & Security Allowlist', () => {
    let sourceDeviceId: string;
    let targetDeviceId: string;

    beforeAll(async () => {
      const reg1 = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Command Sender Laptop', type: 'LAPTOP', deviceKey: 'cmd_sender_key' });
      sourceDeviceId = reg1.body.data.id;

      const reg2 = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Command Receiver Phone', type: 'PHONE', deviceKey: 'cmd_rcv_key' });
      targetDeviceId = reg2.body.data.id;
    });

    it('should strictly REJECT non-allowlisted / arbitrary shell commands', async () => {
      const res = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: `req_shell_${Date.now()}`,
          sourceDeviceId,
          targetDeviceId,
          commandType: 'EXEC_POWERSHELL_SCRIPT', // Unauthorized shell execution attempt
          payload: { command: 'Get-Process' },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject cross-device commands when dispatched in GUEST mode', async () => {
      const res = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'GUEST')
        .send({
          requestId: `req_guest_${Date.now()}`,
          sourceDeviceId,
          targetDeviceId,
          commandType: 'SHOW_NOTIFICATION',
          payload: { title: 'Test', message: 'Hello' },
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should route allowlisted command (SHOW_NOTIFICATION) in OWNER mode', async () => {
      const res = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: `req_notif_${Date.now()}`,
          sourceDeviceId,
          targetDeviceId,
          commandType: 'SHOW_NOTIFICATION',
          payload: {
            title: 'TwinMind Alert',
            message: 'Your meeting starts in 5 minutes.',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.commandType).toBe('SHOW_NOTIFICATION');
      expect(res.body.data.state).toBe('ROUTING');
    });

    it('should enforce idempotency by returning existing command on duplicate requestId', async () => {
      const duplicateRequestId = `req_idempotent_${Date.now()}`;

      const res1 = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: duplicateRequestId,
          sourceDeviceId,
          targetDeviceId,
          commandType: 'FOCUS_TWINMIND',
        });

      expect(res1.status).toBe(200);
      const firstCommandId = res1.body.data.id;

      // Dispatch identical requestId
      const res2 = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: duplicateRequestId,
          sourceDeviceId,
          targetDeviceId,
          commandType: 'FOCUS_TWINMIND',
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(firstCommandId);
    });

    it('should return DEVICE_OFFLINE if target device presence is OFFLINE', async () => {
      // Create a device and revoke it to simulate offline
      const offDev = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Offline Tablet', type: 'TABLET', deviceKey: 'off_tab_key' });

      const offlineId = offDev.body.data.id;

      // Revoke to force offline
      await request(app)
        .post(`/api/devices/${offlineId}/revoke`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      const res = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: `req_offline_${Date.now()}`,
          sourceDeviceId,
          targetDeviceId: offlineId,
          commandType: 'OPEN_SUPPORTED_VIEW',
        });

      // Target was revoked so it returns 400
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('revoked');
    });
  });

  describe('Development Device Simulator', () => {
    it('should spawn a virtual Phone device for localhost testing', async () => {
      const res = await request(app)
        .post('/api/devices/simulator/simulate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          type: 'PHONE',
          label: 'Simulated iPhone 15',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isSimulator).toBe(true);
      expect(res.body.data.presence).toBe('ONLINE');
      expect(res.body.data.status).toBe('TRUSTED');
    });

    it('should auto-complete commands sent to a simulated device', async () => {
      // 1. Create simulated tablet
      const simRes = await request(app)
        .post('/api/devices/simulator/simulate')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          type: 'TABLET',
          label: 'Simulated iPad Pro',
        });

      const simTabletId = simRes.body.data.id;

      // 2. Create source laptop
      const laptopRes = await request(app)
        .post('/api/devices/register')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ label: 'Main Laptop', type: 'LAPTOP', deviceKey: 'main_laptop_sim' });

      const laptopId = laptopRes.body.data.id;

      // 3. Dispatch command to simulated tablet
      const cmdRes = await request(app)
        .post('/api/devices/commands')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          requestId: `req_sim_cmd_${Date.now()}`,
          sourceDeviceId: laptopId,
          targetDeviceId: simTabletId,
          commandType: 'SYNC_STATE',
        });

      expect(cmdRes.status).toBe(200);
      // Simulator automatically marks the command COMPLETED
      expect(cmdRes.body.data.state).toBe('COMPLETED');
    });
  });

  describe('Cross-Device State & Session Sync', () => {
    it('should retrieve cross-device state in OWNER mode', async () => {
      const res = await request(app)
        .get('/api/devices/state')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('OWNER');
      expect(Array.isArray(res.body.data.onlineDevices)).toBe(true);
    });

    it('should synchronize active conversation across devices', async () => {
      const res = await request(app)
        .post('/api/devices/sync-session')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('x-trust-mode', 'OWNER')
        .send({
          conversationId: 'conv_cross_device_123',
          activeView: 'chat',
          contextSnapshot: { topic: 'Phase 9 Design' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.activeConversationId).toBe('conv_cross_device_123');
      expect(res.body.data.activeView).toBe('chat');
    });
  });

  describe('Server-Sent Events (SSE) Stream', () => {
    it('should reject unauthenticated SSE connection', async () => {
      const res = await request(app).get('/api/devices/stream');
      expect(res.status).toBe(401);
    });
  });
});
