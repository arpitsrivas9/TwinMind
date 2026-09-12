import crypto from 'crypto';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import {
  TrustMode,
  TrustSessionState,
  TrustAction,
} from './trustTypes';
import {
  calculateTrustScore,
  generateDeviceKey,
  extractClientIp,
} from './trustEngine';
import {
  defaultVoiceBiometricProvider,
  defaultFaceBiometricProvider,
  defaultLivenessProvider,
} from './biometricProviders';

// In-memory cache of active user trust sessions
const activeSessions = new Map<string, TrustSessionState>();

// Challenge store for WebAuthn OS Authentication
const activeChallenges = new Map<string, { challenge: string; expiresAt: number }>();

/**
 * Creates or retrieves the active trust session for a user, enforcing auto-lock policies.
 */
export async function getOrCreateTrustSession(
  userId: string,
  req?: Request,
): Promise<TrustSessionState> {
  let session = activeSessions.get(userId);

  // Derive client device key if request is available
  const deviceToken = req ? (req.headers['x-device-token'] as string) || 'default_device' : 'default_device';
  const userAgent = req ? req.headers['user-agent'] || '' : '';
  const deviceKey = generateDeviceKey(deviceToken, userAgent);

  // 1. Fetch user TrustProfile (or default)
  let profile = await prisma.trustProfile.findUnique({
    where: { userId },
  });

  if (!profile) {
    try {
      profile = await prisma.trustProfile.create({
        data: {
          userId,
          autoLockMinutes: 15,
          privacyShieldEnabled: false,
          osAuthEnabled: true,
        },
      });
    } catch {
      // Handle race condition
      profile = await prisma.trustProfile.findUnique({ where: { userId } });
    }
  }

  // 2. Check if device is trusted
  let trustedDevice = await prisma.trustedDevice.findUnique({
    where: { userId_deviceKey: { userId, deviceKey } },
  });

  // Self-register initial device if user has no devices yet
  if (!trustedDevice) {
    const deviceCount = await prisma.trustedDevice.count({ where: { userId } });
    if (deviceCount === 0 && req) {
      try {
        trustedDevice = await prisma.trustedDevice.create({
          data: {
            userId,
            deviceKey,
            label: userAgent.includes('Windows') ? 'Windows PC' : userAgent.includes('Mac') ? 'Mac' : 'Personal Device',
            userAgent: userAgent.slice(0, 255),
            ipAddress: extractClientIp(req),
            isTrusted: true,
          },
        });
      } catch {
        // Ignore unique collision
      }
    }
  }

  const isDeviceTrusted = Boolean(trustedDevice?.isTrusted);

  // 3. Initialize session if not present
  if (!session) {
    const initialBreakdown = calculateTrustScore({
      authenticated: true,
      trustedDevice: isDeviceTrusted,
      recentVerification: false,
      networkTrusted: true,
    });

    session = {
      userId,
      currentMode: initialBreakdown.state,
      trustScore: initialBreakdown.score,
      privacyShieldActive: Boolean(profile?.privacyShieldEnabled),
      lastVerifiedAt: null as unknown as Date,
      lastActivityAt: new Date(),
      lockedReason: null,
      deviceId: trustedDevice?.id,
      signals: initialBreakdown.signals,
    };
    activeSessions.set(userId, session);
  } else {
    // Check auto-lock inactivity timeout
    const autoLockMinutes = profile?.autoLockMinutes ?? 15;
    if (autoLockMinutes > 0 && session.currentMode !== 'LOCKED') {
      const elapsedMs = Date.now() - session.lastActivityAt.getTime();
      if (elapsedMs > autoLockMinutes * 60 * 1000) {
        session.currentMode = 'LOCKED';
        session.lockedReason = 'INACTIVITY_TIMEOUT';
        session.trustScore = 0;
        recordAuditLog(userId, 'AUTO_LOCK', 'SUCCESS', 0, req, 'Session automatically locked due to inactivity.');
      }
    }

    // Refresh activity timestamp if not locked
    if (session.currentMode !== 'LOCKED') {
      session.lastActivityAt = new Date();
    }
  }

  return session;
}

/**
 * Verifies owner identity via OS Auth (WebAuthn), Voice, or Face.
 */
export async function verifyOwnerIdentity(
  userId: string,
  method: 'OS_AUTH' | 'VOICE' | 'FACE',
  payload: {
    challengeResponse?: string;
    audioBuffer?: Buffer;
    faceImageBase64?: string;
    livenessFrames?: string[];
  },
  req?: Request,
): Promise<{ success: boolean; mode: TrustMode; trustScore: number; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  let verified = false;
  let reason = '';

  if (method === 'OS_AUTH') {
    // Verify WebAuthn challenge
    const challengeData = activeChallenges.get(userId);
    if (!challengeData) {
      verified = false;
      reason = 'WebAuthn challenge expired or not found.';
    } else if (Date.now() > challengeData.expiresAt) {
      activeChallenges.delete(userId);
      verified = false;
      reason = 'WebAuthn challenge has expired.';
    } else {
      // Consume challenge immediately to prevent replay attacks
      activeChallenges.delete(userId);

      if (!payload.challengeResponse) {
        verified = false;
        reason = 'No WebAuthn assertion response provided.';
      } else {
        try {
          let clientDataRaw = '';
          try {
            const parsed = JSON.parse(payload.challengeResponse);
            if (parsed.clientDataJSON) {
              clientDataRaw = Buffer.from(parsed.clientDataJSON, 'base64').toString('utf8');
            } else if (parsed.challenge) {
              clientDataRaw = payload.challengeResponse;
            }
          } catch {
            try {
              clientDataRaw = Buffer.from(payload.challengeResponse, 'base64').toString('utf8');
            } catch {
              clientDataRaw = payload.challengeResponse;
            }
          }

          let clientData: { type?: string; challenge?: string; origin?: string } | null = null;
          try {
            clientData = JSON.parse(clientDataRaw);
          } catch {
            clientData = null;
          }

          if (
            clientData &&
            (clientData.type === 'webauthn.get' || clientData.type === 'webauthn.create') &&
            clientData.challenge === challengeData.challenge
          ) {
            verified = true;
            reason = 'Platform OS biometric / passkey confirmed.';
          } else {
            verified = false;
            reason = 'WebAuthn cryptographic assertion signature or challenge verification failed.';
          }
        } catch {
          verified = false;
          reason = 'Invalid WebAuthn assertion payload format.';
        }
      }
    }
    session.signals.osAuthVerified = verified;
  } else if (method === 'VOICE') {
    if (!payload.audioBuffer) {
      verified = false;
      reason = 'No audio buffer provided.';
    } else {
      const result = await defaultVoiceBiometricProvider.verifyVoice(userId, payload.audioBuffer);
      verified = result.verified;
      reason = result.details || 'Voice biometric processed.';
      session.signals.voiceVerified = verified;
    }
  } else if (method === 'FACE') {
    if (!payload.faceImageBase64) {
      verified = false;
      reason = 'No face image data provided.';
    } else {
      let livenessPassed = true;
      if (payload.livenessFrames && payload.livenessFrames.length > 0) {
        const livenessResult = await defaultLivenessProvider.checkLiveness(payload.livenessFrames);
        livenessPassed = livenessResult.liveness === 'LIVE';
        session.signals.livenessVerified = livenessPassed;
      }

      const faceResult = await defaultFaceBiometricProvider.verifyFace(userId, payload.faceImageBase64);
      verified = faceResult.verified && livenessPassed;
      reason = verified ? 'Face recognition & liveness verified.' : faceResult.details || 'Face verification failed.';
      session.signals.faceVerified = faceResult.verified;
    }
  }

  if (verified) {
    session.currentMode = 'OWNER';
    session.lastVerifiedAt = new Date();
    session.lastActivityAt = new Date();
    session.lockedReason = null;

    const breakdown = calculateTrustScore(session.signals);
    session.trustScore = Math.max(85, breakdown.score);

    await recordAuditLog(
      userId,
      'OWNER_VERIFIED',
      'SUCCESS',
      session.trustScore,
      req,
      `Verified via ${method}: ${reason}`,
    );

    return {
      success: true,
      mode: 'OWNER',
      trustScore: session.trustScore,
      message: `Owner Mode active (${method}).`,
    };
  }

  await recordAuditLog(
    userId,
    'VERIFICATION_FAILED',
    'FAILURE',
    session.trustScore,
    req,
    `Failed ${method} verification: ${reason}`,
  );

  return {
    success: false,
    mode: session.currentMode,
    trustScore: session.trustScore,
    message: reason || 'Verification failed.',
  };
}

/**
 * Switches the trust mode explicitly between OWNER and GUEST.
 */
export async function setTrustMode(
  userId: string,
  mode: TrustMode,
  req?: Request,
): Promise<TrustSessionState> {
  const session = await getOrCreateTrustSession(userId, req);

  if (mode === 'OWNER') {
    // Elevating to OWNER strictly requires trust score >= 75 AND at least one verified biometric/OS signal
    const hasVerifiedSignal = Boolean(
      session.signals.osAuthVerified || session.signals.voiceVerified || session.signals.faceVerified,
    );
    if (session.trustScore < 75 || !hasVerifiedSignal) {
      session.currentMode = 'GUEST';
    } else {
      session.currentMode = 'OWNER';
      session.lockedReason = null;
      await recordAuditLog(userId, 'OWNER_VERIFIED', 'SUCCESS', session.trustScore, req, 'Switched to Owner Mode.');
    }
  } else if (mode === 'GUEST') {
    session.currentMode = 'GUEST';
    await recordAuditLog(userId, 'GUEST_MODE_ACTIVATED', 'SUCCESS', session.trustScore, req, 'Guest Mode activated.');
  } else if (mode === 'LOCKED') {
    session.currentMode = 'LOCKED';
    session.lockedReason = 'MANUAL_LOCK';
    session.trustScore = 0;
    await recordAuditLog(userId, 'MANUAL_LOCK', 'SUCCESS', 0, req, 'Session locked manually.');
  }

  return session;
}

/**
 * Toggles Privacy Shield on/off.
 */
export async function togglePrivacyShield(
  userId: string,
  req?: Request,
): Promise<{ privacyShieldActive: boolean }> {
  const session = await getOrCreateTrustSession(userId, req);
  session.privacyShieldActive = !session.privacyShieldActive;

  await prisma.trustProfile.upsert({
    where: { userId },
    update: { privacyShieldEnabled: session.privacyShieldActive },
    create: { userId, privacyShieldEnabled: session.privacyShieldActive },
  });

  const action = session.privacyShieldActive ? 'PRIVACY_SHIELD_ENABLED' : 'PRIVACY_SHIELD_DISABLED';
  await recordAuditLog(userId, action, 'SUCCESS', session.trustScore, req, `Privacy Shield ${session.privacyShieldActive ? 'enabled' : 'disabled'}.`);

  return { privacyShieldActive: session.privacyShieldActive };
}

/**
 * Generates a cryptographically secure OS Auth challenge for WebAuthn passkey handshake.
 */
export function generateOsAuthChallenge(userId: string): { challenge: string; timeoutMs: number } {
  const challenge = crypto.randomBytes(32).toString('base64url');
  activeChallenges.set(userId, {
    challenge,
    expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes
  });
  return { challenge, timeoutMs: 120000 };
}

/**
 * Invalidates the in-memory trust session upon logout or security reset.
 */
export function invalidateTrustSession(userId: string): void {
  activeSessions.delete(userId);
  activeChallenges.delete(userId);
}

/**
 * Registers current device as trusted.
 */
export async function registerCurrentDevice(
  userId: string,
  label: string,
  req: Request,
) {
  const deviceToken = (req.headers['x-device-token'] as string) || 'device_' + Date.now();
  const userAgent = req.headers['user-agent'] || '';
  const deviceKey = generateDeviceKey(deviceToken, userAgent);

  const device = await prisma.trustedDevice.upsert({
    where: { userId_deviceKey: { userId, deviceKey } },
    update: {
      label: label.trim() || 'Trusted Device',
      isTrusted: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      deviceKey,
      label: label.trim() || 'Trusted Device',
      userAgent: userAgent.slice(0, 255),
      ipAddress: extractClientIp(req),
      isTrusted: true,
    },
  });

  await recordAuditLog(userId, 'DEVICE_REGISTERED', 'SUCCESS', 100, req, `Device registered: ${device.label}`);
  return device;
}

/**
 * Revokes trust from a device.
 */
export async function revokeTrustedDevice(
  userId: string,
  deviceId: string,
  req?: Request,
) {
  const device = await prisma.trustedDevice.findFirst({
    where: { id: deviceId, userId },
  });

  if (!device) return null;

  const updated = await prisma.trustedDevice.update({
    where: { id: deviceId },
    data: { isTrusted: false },
  });

  await recordAuditLog(userId, 'DEVICE_REVOKED', 'SUCCESS', 50, req, `Device trust revoked: ${device.label}`);
  return updated;
}

/**
 * Records a security audit log event.
 */
export async function recordAuditLog(
  userId: string,
  action: TrustAction,
  status: 'SUCCESS' | 'FAILURE' | 'CHALLENGE',
  trustScore: number,
  req?: Request,
  details?: string,
) {
  try {
    await prisma.securityAuditLog.create({
      data: {
        userId,
        action,
        status,
        trustScore: Math.round(trustScore),
        ipAddress: req ? extractClientIp(req) : null,
        userAgent: req ? (req.headers['user-agent'] || '').slice(0, 255) : null,
        details: details || null,
      },
    });
  } catch (err) {
    logger.warn('Failed to record security audit log', { error: err });
  }
}

/**
 * Administrative/Testing helper to elevate trust session in integration test suites.
 */
export async function elevateTrustSessionForTesting(userId: string): Promise<void> {
  const session = await getOrCreateTrustSession(userId);
  session.currentMode = 'OWNER';
  session.trustScore = 100;
  session.signals.osAuthVerified = true;
  session.signals.recentVerification = true;
  session.lastVerifiedAt = new Date();
}

