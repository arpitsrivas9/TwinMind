// scratch/verify_phase9_full.js
// Verification for TwinMind Phase 9 Cross-Device Architecture & Responsive Device OS

const BASE_URL = 'http://localhost:4000';
const FRONTEND_URL = 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log('========================================================================');
  console.log('📱 TWINMIND PHASE 9 — CROSS-DEVICE PAIRING & DEVICE OS VERIFICATION');
  console.log('========================================================================\n');

  // 1. Check Network Info & Dynamic IP resolution
  console.log('--- Step 1: Dynamic LAN Host Resolution ---');
  const netRes = await fetch(`${BASE_URL}/api/devices/network-info`);
  assert(netRes.status === 200, '/api/devices/network-info returned 200 OK');
  const netJson = await netRes.json();
  assert(netJson.success === true, 'Network info API response success === true');
  const netData = netJson.data;
  console.log(`  LAN Host IP: ${netData.ip} (interface: ${netData.interfaceName})`);
  console.log(`  Frontend URL: ${netData.frontendUrl}`);
  console.log(`  Pairing URL: ${netData.pairingUrl}`);
  assert(netData.ip !== '127.0.0.1' && netData.ip.length > 0, 'Resolved non-loopback dynamic LAN IP');

  // 2. Test Frontend Routes
  console.log('\n--- Step 2: Mobile Web Pairing Routes ---');
  const pairRouteRes = await fetch(`${FRONTEND_URL}/pair`);
  assert(pairRouteRes.status === 200, 'Frontend /pair served with HTTP 200');
  const pairHtml = await pairRouteRes.text();
  assert(pairHtml.includes('TwinMind') || pairHtml.includes('Pair'), 'HTML contains TwinMind pairing client bundle');

  const dynamicPairRouteRes = await fetch(`${FRONTEND_URL}/pair/519-824`);
  assert(dynamicPairRouteRes.status === 200, 'Frontend /pair/[sessionId] served with HTTP 200');

  // 3. User Authentication for Owner Host
  console.log('\n--- Step 3: Owner Authentication & Pairing Session Creation ---');
  const userEmail = `device_owner_${Date.now()}@twinmind.local`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      password: 'OwnerPassword999!',
      name: 'Owner Host User',
    }),
  });
  const signupJson = await signupRes.json();
  assert(signupRes.status === 201, 'Owner account created with HTTP 201');
  const ownerToken = signupJson.data.token;
  const ownerHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ownerToken}`,
    'x-trust-mode': 'OWNER',
  };

  // 4. Initiate Pairing Session (Laptop generates QR and 6-digit PIN)
  console.log('\n--- Step 4: Laptop Host Initiates Pairing Session ---');
  const initRes = await fetch(`${BASE_URL}/api/devices/pairing/initiate`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  const initJson = await initRes.json();
  assert(initRes.status === 201, 'Pairing session initiated with HTTP 201');
  const session = initJson.data;
  console.log(`  Generated PIN: ${session.pairingCode}`);
  console.log(`  Session ID: ${session.id}`);
  const numericPin = session.pairingCode.replace(/[^0-9]/g, '');
  assert(numericPin.length === 6 && /^\d{6}$/.test(numericPin), 'Pairing code contains 6 numeric digits');
  assert(session.status === 'INITIATED', 'Initial session status is INITIATED');

  // 5. Mobile Device joins via PIN (Candidate Client Request)
  console.log('\n--- Step 5: Mobile Device Joins via 6-Digit PIN ---');
  const mobileDeviceKey = `mob_device_${Date.now()}`;
  const joinRes = await fetch(`${BASE_URL}/api/devices/pairing/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingCode: session.pairingCode,
      candidateDevice: {
        label: 'Physical Phone (Pixel 8)',
        type: 'PHONE',
        deviceKey: mobileDeviceKey,
        platformInfo: {
          os: 'Android 14',
          browser: 'Chrome Mobile',
          model: 'Pixel 8',
        },
      },
    }),
  });
  const joinJson = await joinRes.json();
  assert(joinRes.status === 200, 'Mobile join request succeeded with HTTP 200');
  assert(joinJson.data.status === 'PENDING_APPROVAL', 'Candidate status transitioned to PENDING_APPROVAL');
  console.log('  Candidate device registered in session, waiting for Owner approval');

  // 6. Check Pairing Status on Mobile (Still Waiting)
  console.log('\n--- Step 6: Mobile Client Polls Status Before Approval ---');
  const statusBeforeRes = await fetch(`${BASE_URL}/api/devices/pairing/${session.id}/status`);
  const statusBeforeJson = await statusBeforeRes.json();
  assert(statusBeforeJson.data.status === 'PENDING_APPROVAL', 'Status reports PENDING_APPROVAL');
  assert(!statusBeforeJson.data.deviceToken, 'Device token NOT issued before Owner approval');

  // 7. Owner Laptop Approves Device (Global DeviceApprovalModal action)
  console.log('\n--- Step 7: Owner Laptop Approves Incoming Request ---');
  const approveRes = await fetch(`${BASE_URL}/api/devices/pairing/${session.id}/approve`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  const approveJson = await approveRes.json();
  assert(approveRes.status === 200, 'Host approval succeeded with HTTP 200');
  const pairedDevice = approveJson.data.device;
  console.log(`  Device Approved: ${pairedDevice.label} (ID: ${pairedDevice.id})`);
  assert(pairedDevice.isTrusted === true, 'Approved device marked as isTrusted = true');
  assert(pairedDevice.status === 'TRUSTED', 'Approved device status is TRUSTED');

  // 8. Mobile Client Polls Status After Approval (Gets Credentials)
  console.log('\n--- Step 8: Mobile Client Retrieves Tokens Post-Approval ---');
  const statusAfterRes = await fetch(`${BASE_URL}/api/devices/pairing/${session.id}/status`);
  const statusAfterJson = await statusAfterRes.json();
  assert(statusAfterJson.data.status === 'APPROVED', 'Status transitioned to APPROVED');
  assert(statusAfterJson.data.sessionToken.length > 20, 'Session JWT token issued to mobile device');
  assert(statusAfterJson.data.deviceToken.length > 20, 'Secure device token issued to mobile device');

  // 9. Diagnostic Connection Ping (Bidirectional latency test)
  console.log('\n--- Step 9: Diagnostic Connection Ping & RTT Latency ---');
  const pingRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}/ping`, {
    method: 'POST',
    headers: ownerHeaders,
    body: JSON.stringify({ timestamp: Date.now() }),
  });
  const pingJson = await pingRes.json();
  assert(pingRes.status === 200, 'Diagnostic ping succeeded with HTTP 200');
  assert(pingJson.data.pong === true, 'Pong response received');
  console.log(`  Ping RTT: ${pingJson.data.latencyMs}ms (Transport: ${pingJson.data.transport})`);

  // 10. Update Granular Permissions Matrix
  console.log('\n--- Step 10: Granular Permissions Matrix Update ---');
  const newPermissions = ['NOTIFICATIONS', 'SYNC_SESSION', 'SYNC_MEMORY', 'RECEIVE_COMMAND'];
  const updateRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}`, {
    method: 'PUT',
    headers: ownerHeaders,
    body: JSON.stringify({
      label: 'Verified iPhone 15 Pro',
      permissions: newPermissions,
    }),
  });
  const updateJson = await updateRes.json();
  assert(updateRes.status === 200, 'Permissions updated with HTTP 200');
  const updatedDev = updateJson.data.device || updateJson.data;
  assert(updatedDev.label === 'Verified iPhone 15 Pro', 'Device label renamed');
  assert(updatedDev.permissions.length === 4, 'Granular permissions correctly persisted');

  // 11. Differentiated Lifecycle Actions: Disconnect -> Revoke -> Unpair -> Delete
  console.log('\n--- Step 11: Differentiated Lifecycle Operations ---');

  // 11a: Disconnect (offline presence, retains pairing)
  console.log('  Testing DISCONNECT...');
  const disconRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}/disconnect`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  const disconJson = await disconRes.json();
  assert(disconRes.status === 200, 'Disconnect succeeded');
  assert(disconJson.data.success === true, 'Disconnect reports success');

  const checkDevRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}`, {
    headers: ownerHeaders,
  });
  const checkDevJson = await checkDevRes.json();
  assert(checkDevJson.data.presence === 'OFFLINE' || checkDevJson.data.status === 'DISCONNECTED', 'Device presence successfully transitioned to OFFLINE');

  // 11b: Revoke Access (blocks routing, status REVOKED)
  console.log('  Testing REVOKE...');
  const revokeRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}/revoke`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  const revokeJson = await revokeRes.json();
  assert(revokeRes.status === 200, 'Revoke succeeded');
  const revokedDev = revokeJson.data.device || revokeJson.data;
  assert(revokedDev.status === 'REVOKED', 'Status marked REVOKED');

  // 11c: Unpair (invalidates credentials, status UNPAIRED)
  console.log('  Testing UNPAIR...');
  const unpairRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}/unpair`, {
    method: 'POST',
    headers: ownerHeaders,
  });
  const unpairJson = await unpairRes.json();
  assert(unpairRes.status === 200, 'Unpair succeeded');
  const unpairedDev = unpairJson.data.device || unpairJson.data;
  assert(unpairedDev.status === 'UNPAIRED', 'Status marked UNPAIRED');

  // 11d: Permanently Delete (removes from database)
  console.log('  Testing PERMANENT DELETE...');
  const delRes = await fetch(`${BASE_URL}/api/devices/${pairedDevice.id}`, {
    method: 'DELETE',
    headers: ownerHeaders,
  });
  const delJson = await delRes.json();
  assert(delRes.status === 200, 'Delete succeeded');
  assert(delJson.success === true, 'Device successfully deleted from PostgreSQL');

  console.log('\n========================================================================');
  console.log('🎉 ALL PHASE 9 CROSS-DEVICE TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
