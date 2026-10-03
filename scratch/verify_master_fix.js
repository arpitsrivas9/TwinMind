// scratch/verify_master_fix.js
// Comprehensive End-to-End Live Verification for Master Fix & Phase 9.1

const fetch = globalThis.fetch;
const BASE_URL = 'http://localhost:4000';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('========================================================================');
  console.log('🚀 TWINMIND MASTER FIX — END-TO-END VERIFICATION');
  console.log('========================================================================\n');

  // 1. User Registration & Setup
  console.log('--- Step 1: User Registration & Session Initialization ---');
  const userEmail = `master_test_${Date.now()}@twinmind.local`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userEmail,
      password: 'SecurePassword123!',
      name: 'TwinMind Master Owner',
    }),
  });
  const signupJson = await signupRes.json();
  assert(signupRes.status === 201, 'User signup returns 201 Created');
  const token = signupJson.data.token;
  const userId = signupJson.data.user.id;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 2. Initial Biometric Enrollment (Deadlock Check)
  console.log('\n--- Step 2: Initial Biometrics Enrollment (No Deadlock) ---');
  // First verify OS_AUTH to authenticate as owner
  const chalRes = await fetch(`${BASE_URL}/api/trust/os-auth/challenge`, {
    method: 'POST',
    headers: authHeaders,
  });
  const chalJson = await chalRes.json();
  assert(chalRes.status === 200, 'OS Auth challenge generated');
  const challenge = chalJson.data.challenge;

  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: challenge,
      origin: 'http://localhost:3000',
    })
  ).toString('base64');

  const assertionPayload = JSON.stringify({
    credentialId: `cred_${Date.now()}`,
    clientDataJSON,
    signature: Buffer.from('mock_sig').toString('base64'),
    authenticatorData: Buffer.from('mock_auth').toString('base64'),
  });

  const verifyRes = await fetch(`${BASE_URL}/api/trust/verify`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      method: 'OS_AUTH',
      challengeResponse: assertionPayload,
    }),
  });
  const verifyJson = await verifyRes.json();
  assert(verifyRes.status === 200, 'Owner OS_AUTH verification succeeded');
  assert(verifyJson.data.mode === 'OWNER', 'Mode elevated to OWNER');

  // Enroll Face Template (Multi-frame with realistic facial gradient)
  const createFaceFrame = (varianceOffset = 0) => {
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i % 32;
      const y = Math.floor(i / 32);
      const dx = x - 16;
      const dy = y - 16;
      const dist = Math.sqrt(dx * dx + dy * dy);
      buf[i] = Math.max(30, Math.min(230, Math.round(180 - dist * 5 + varianceOffset)));
    }
    return buf.toString('base64');
  };

  const faceRes = await fetch(`${BASE_URL}/api/trust/face/enroll`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      imageBase64: [
        createFaceFrame(0),
        createFaceFrame(5),
        createFaceFrame(8),
        createFaceFrame(12),
      ],
    }),
  });
  const faceJson = await faceRes.json();
  if (faceRes.status !== 201) {
    console.error('Face enrollment failed with status:', faceRes.status, faceJson);
  }
  assert(faceRes.status === 201, 'Initial face enrollment succeeded without deadlock');
  assert(faceJson.data.enrolled === true, 'Face reported as enrolled: true');

  // 3. Persistent Memory (TwinMemory™) Across Conversations
  console.log('\n--- Step 3: Persistent Memory (TwinMemory™) Verification ---');
  // Save explicit memory: "Remember that my favorite editor is VS Code"
  const memCreateRes = await fetch(`${BASE_URL}/api/memories`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      content: 'Remember that my favorite editor is VS Code',
      type: 'USER_PREFERENCE',
      tags: ['editor', 'vscode', 'tools'],
      confidence: 1.0,
    }),
  });
  const memCreateJson = await memCreateRes.json();
  assert(memCreateRes.status === 201, 'Memory created successfully');
  const memoryId = memCreateJson.data.id;
  assert(memCreateJson.data.content.includes('VS Code'), 'Memory stores VS Code');

  // Search memories for "What is my favorite editor?"
  const memSearchRes = await fetch(
    `${BASE_URL}/api/memories/search?q=${encodeURIComponent('What is my favorite editor?')}`,
    {
      method: 'GET',
      headers: authHeaders,
    }
  );
  const memSearchJson = await memSearchRes.json();
  assert(memSearchRes.status === 200, 'Memory search returns 200');
  assert(
    memSearchJson.data.some((m) => m.content.includes('VS Code')),
    'Memory ranker retrieves "VS Code" for query "What is my favorite editor?"'
  );

  // 4. Guest Mode Isolation & Authoritative Privacy Shield
  console.log('\n--- Step 4: Guest Mode Isolation & Privacy Boundary ---');
  // Explicitly activate Guest Mode
  const guestModeRes = await fetch(`${BASE_URL}/api/trust/mode`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ mode: 'GUEST' }),
  });
  const guestModeJson = await guestModeRes.json();
  assert(guestModeRes.status === 200, 'Switched to GUEST mode');
  assert(guestModeJson.data.mode === 'GUEST', 'Trust session reflects GUEST');

  // Verify memory access is blocked with 403 in Guest Mode
  const guestMemRes = await fetch(`${BASE_URL}/api/memories`, {
    method: 'GET',
    headers: authHeaders,
  });
  assert(guestMemRes.status === 403, 'Guest Mode strictly blocks GET /api/memories with 403 Forbidden');

  // Verify memory search is blocked with 403 in Guest Mode
  const guestMemSearchRes = await fetch(`${BASE_URL}/api/memories/search?q=editor`, {
    method: 'GET',
    headers: authHeaders,
  });
  assert(guestMemSearchRes.status === 403, 'Guest Mode strictly blocks GET /api/memories/search with 403 Forbidden');

  // 5. Multimodal Presence Scenarios (A, B, C, D)
  console.log('\n--- Step 5: Multimodal Biometric Decision Matrix Scenarios ---');

  // Scenario G: Owner voice verified while in Guest Mode -> promotes to OWNER
  const voiceElevateRes = await fetch(`${BASE_URL}/api/trust/evaluate-presence`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      cameraEvidence: 'NO_FACE',
      voiceEvidence: 'OWNER_VOICE',
    }),
  });
  const voiceElevateJson = await voiceElevateRes.json();
  assert(voiceElevateRes.status === 200, 'Scenario B (Voice elevation without camera) succeeded');
  assert(voiceElevateJson.data.mode === 'OWNER', 'Owner mode active from voice alone');

  // Scenario A: Camera (OWNER_FACE) + Voice (OWNER_VOICE) -> 100% confidence boost
  const comboRes = await fetch(`${BASE_URL}/api/trust/evaluate-presence`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      cameraEvidence: 'OWNER_FACE',
      voiceEvidence: 'OWNER_VOICE',
    }),
  });
  const comboJson = await comboRes.json();
  assert(comboRes.status === 200, 'Scenario A & D (Face + Voice combined) succeeded');
  assert(comboJson.data.trustScore === 100, 'Confidence elevated to 100%');

  // Scenario C: Non-owner speaks (Active Speaker Precedence) -> demotes to GUEST
  const nonOwnerRes = await fetch(`${BASE_URL}/api/trust/evaluate-presence`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      cameraEvidence: 'OWNER_FACE',
      voiceEvidence: 'NON_OWNER_VOICE',
    }),
  });
  const nonOwnerJson = await nonOwnerRes.json();
  assert(nonOwnerRes.status === 200, 'Scenario C (Active Speaker Precedence) succeeded');
  assert(nonOwnerJson.data.mode === 'GUEST', 'Demoted to GUEST because non-owner spoke');
  assert(nonOwnerJson.data.trustScore <= 35, 'Trust score dropped to <= 35');

  // 6. Phase 9.1 Cross-Device Local Pairing & Diagnostics
  console.log('\n--- Step 6: Phase 9.1 Cross-Device Pairing Lifecycle ---');
  // Re-elevate to Owner
  await fetch(`${BASE_URL}/api/trust/evaluate-presence`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      cameraEvidence: 'OWNER_FACE',
      voiceEvidence: 'OWNER_VOICE',
    }),
  });

  // Initiate pairing
  const pairInitRes = await fetch(`${BASE_URL}/api/devices/pairing/initiate`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      deviceType: 'MOBILE',
      label: 'Samsung Galaxy S24',
    }),
  });
  const pairInitJson = await pairInitRes.json();
  assert(pairInitRes.status === 201, 'Pairing initiated returns 201');
  const rawPairingCode = pairInitJson.data.pairingCode || pairInitJson.data.pin;
  const pairingPin = rawPairingCode.replace(/[^0-9]/g, '');
  const pairingSessionId = pairInitJson.data.id || pairInitJson.data.sessionId;
  assert(/^\d{6}$/.test(pairingPin), 'Pairing PIN is a 6-digit numeric string');

  // Mobile joins pairing via PIN
  const joinRes = await fetch(`${BASE_URL}/api/devices/pairing/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairingCode: rawPairingCode,
      candidateDevice: {
        label: 'Galaxy Phone Client',
        type: 'PHONE',
      },
    }),
  });
  const joinJson = await joinRes.json();
  if (joinRes.status !== 200) {
    console.error('Join pairing failed with status:', joinRes.status, joinJson);
  }
  assert(joinRes.status === 200, 'Mobile pairing join returns 200');
  assert(joinJson.data.status === 'PENDING_APPROVAL', 'Status is PENDING_APPROVAL');

  // Laptop approves pairing
  const approveRes = await fetch(`${BASE_URL}/api/devices/pairing/${pairingSessionId}/approve`, {
    method: 'POST',
    headers: { ...authHeaders, 'x-trust-mode': 'OWNER' },
  });
  const approveJson = await approveRes.json();
  assert(approveRes.status === 200, 'Pairing approval returns 200');
  assert(approveJson.data.device.isTrusted === true, 'Approved device is marked trusted');
  const pairedDeviceId = approveJson.data.device.id;

  // Poll pairing status to confirm APPROVED
  const pollRes = await fetch(`${BASE_URL}/api/devices/pairing/${pairingSessionId}/status`, {
    method: 'GET',
    headers: authHeaders,
  });
  const pollJson = await pollRes.json();
  assert(pollRes.status === 200, 'Pairing status poll returns 200');
  assert(pollJson.data.status === 'APPROVED', 'Pairing status is APPROVED');

  // Diagnostic ping
  const pingRes = await fetch(`${BASE_URL}/api/devices/${pairedDeviceId}/ping`, {
    method: 'POST',
    headers: authHeaders,
  });
  const pingJson = await pingRes.json();
  assert(pingRes.status === 200, 'Cross-device diagnostic ping returns 200');
  assert(pingJson.data.pong === true, 'Paired device responds with pong: true');
  assert(pingJson.data.latencyMs >= 0, 'Ping calculates round-trip latency');
  assert(pingJson.data.transport === 'LOCAL_NETWORK', 'Transport is LOCAL_NETWORK');

  // Cleanup: unpair device
  const unpairRes = await fetch(`${BASE_URL}/api/devices/${pairedDeviceId}/unpair`, {
    method: 'POST',
    headers: authHeaders,
  });
  assert(unpairRes.status === 200, 'Device unpair succeeded');

  console.log('\n========================================================================');
  console.log('✅ ALL MASTER FIX & PHASE 9.1 SPECIFICATIONS 100% VERIFIED!');
  console.log('========================================================================\n');
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
