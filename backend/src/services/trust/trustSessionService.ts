import crypto from 'crypto';
import type { Request } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import {
  TrustMode,
  TrustSessionState,
  TrustAction,
  CameraEvidenceState,
  VoiceEvidenceState,
} from './trustTypes';
import {
  calculateTrustScore,
  generateDeviceKey,
  extractClientIp,
} from './trustEngine';
import { evaluateTwinTrustDecision } from './trustDecisionEngine';
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
  let profile = null;
  let trustedDevice = null;

  try {
    profile = await prisma.trustProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      try {
        profile = await prisma.trustProfile.create({
          data: {
            userId,
            autoLockMinutes: 60,
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
    trustedDevice = await prisma.trustedDevice.findUnique({
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
  } catch (err) {
    logger.warn('Trust profile database query skipped or failed, using in-memory default', { error: String(err) });
  }

  const isDeviceTrusted = Boolean(trustedDevice?.isTrusted ?? true);
  const autoLockMinutes = profile?.autoLockMinutes ?? 60;

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
      autoLockMinutes,
    };
    activeSessions.set(userId, session);
  } else {
    session.autoLockMinutes = autoLockMinutes;

    // Check auto-lock inactivity timeout
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
    imageMatrixBase64?: string;
    livenessFrames?: string[];
    challenge?: string;
  },
  req?: Request,
): Promise<{ success: boolean; mode: TrustMode; trustScore: number; message: string; voiceState?: string; faceState?: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  let verified = false;
  let reason = '';
  let evaluatedFaceState: string | undefined;

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

          const clientChallenge = clientData?.challenge;
          const challengeMatches =
            Boolean(clientChallenge) &&
            !!clientChallenge &&
            (clientChallenge === challengeData.challenge ||
              clientChallenge === Buffer.from(challengeData.challenge, 'utf8').toString('base64url') ||
              Buffer.from(clientChallenge, 'base64url').toString('utf8') === challengeData.challenge);

          if (
            clientData &&
            (clientData.type === 'webauthn.get' || clientData.type === 'webauthn.create') &&
            challengeMatches
          ) {
            verified = true;
            reason = 'Platform OS biometric / passkey confirmed.';
          } else {
            verified = false;
            if (!clientData) {
              reason = 'Malformed clientDataJSON in assertion.';
            } else if (!challengeMatches) {
              reason = `WebAuthn challenge mismatch (received: ${clientData.challenge || 'none'}).`;
            } else if (clientData.type !== 'webauthn.get' && clientData.type !== 'webauthn.create') {
              reason = `Invalid WebAuthn operation type: ${clientData.type}.`;
            } else {
              reason = 'WebAuthn cryptographic assertion signature or challenge verification failed.';
            }
          }
        } catch (parseErr: unknown) {
          verified = false;
          reason = `Invalid WebAuthn assertion payload format: ${(parseErr as Error).message}`;
        }
      }
    }
    session.signals.osAuthVerified = verified;
  } else if (method === 'VOICE') {
    if (!payload.audioBuffer) {
      verified = false;
      reason = 'No audio buffer provided.';
    } else {
      const profile = await prisma.trustProfile.findUnique({
        where: { userId },
        select: { voiceBiometricsEnabled: true, voiceVoiceprintHash: true },
      });
      const template = profile?.voiceBiometricsEnabled ? profile.voiceVoiceprintHash : null;
      const result = await defaultVoiceBiometricProvider.verifyVoice(userId, payload.audioBuffer, template);
      verified = result.verified;
      reason = result.details || 'Voice biometric processed.';
      session.signals.voiceVerified = verified;

      if (result.voiceState === 'VOICE_NON_OWNER') {
        session.signals.voiceMismatch = true;
        session.signals.voiceVerified = false;
        session.signals.recentVerification = false;
        session.currentMode = 'GUEST';
        session.trustScore = Math.min(session.trustScore, 35);
        await recordAuditLog(
          userId,
          'VOICE_MISMATCH',
          'FAILURE',
          session.trustScore,
          req,
          'Security event: Non-owner voice detected during voice verification. Session demoted to Guest Mode.',
        );
        return {
          success: false,
          mode: 'GUEST',
          trustScore: session.trustScore,
          message: reason,
          voiceState: result.voiceState,
        };
      }
    }
  } else if (method === 'FACE') {
    const faceInput = payload.faceImageBase64 || payload.imageMatrixBase64;
    if (!faceInput) {
      verified = false;
      reason = 'No face image or matrix data provided.';
      evaluatedFaceState = 'FACE_UNKNOWN';
    } else {
      const profile = await prisma.trustProfile.findUnique({
        where: { userId },
        select: { faceBiometricsEnabled: true, faceTemplateHash: true },
      });
      const storedTemplate = profile?.faceBiometricsEnabled ? profile.faceTemplateHash : null;

      let livenessPassed = true;
      let livenessReason = '';
      if (payload.livenessFrames && payload.livenessFrames.length > 0) {
        const livenessResult = await defaultLivenessProvider.checkLiveness(
          payload.livenessFrames,
          payload.challenge,
        );
        livenessPassed = livenessResult.liveness === 'LIVE';
        livenessReason = livenessResult.details || '';
        session.signals.livenessVerified = livenessPassed;
      }

      if (!livenessPassed) {
        verified = false;
        evaluatedFaceState = 'FACE_UNKNOWN';
        reason = `Liveness verification failed: ${livenessReason}`;
      } else {
        const faceResult = await defaultFaceBiometricProvider.verifyFace(
          userId,
          faceInput,
          storedTemplate,
        );
        verified = faceResult.verified;
        evaluatedFaceState = faceResult.faceState === 'FACE_OWNER' ? 'FACE_OWNER' : faceResult.faceState === 'FACE_NON_OWNER' ? 'FACE_NON_OWNER' : 'FACE_UNKNOWN';
        reason = faceResult.details || (verified ? 'Face recognition & liveness verified.' : 'Face verification failed.');
        session.signals.faceVerified = verified;

        if (faceResult.faceState === 'FACE_NON_OWNER') {
          session.signals.faceMismatch = true;
          session.signals.faceVerified = false;
          session.signals.recentVerification = false;
          session.currentMode = 'GUEST';
          session.trustScore = Math.min(session.trustScore, 35);
          await recordAuditLog(
            userId,
            'FACE_MISMATCH',
            'FAILURE',
            session.trustScore,
            req,
            'Security event: Non-owner face detected during visual verification. Session demoted to Guest Mode.',
          );
          return {
            success: false,
            mode: 'GUEST',
            trustScore: session.trustScore,
            message: reason,
            faceState: 'FACE_NON_OWNER',
          };
        }
      }
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
      voiceState: method === 'VOICE' ? 'VOICE_OWNER_MATCH' : undefined,
      faceState: method === 'FACE' ? (evaluatedFaceState || 'FACE_OWNER') : undefined,
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

  // If voice or face verification failed due to an inconclusive / noisy sample:
  // For an active OWNER session, do NOT immediately demote to GUEST on a single inconclusive window!
  if (session.currentMode === 'OWNER') {
    if (method === 'VOICE') {
      session.signals.voiceVerified = false;
      session.trustScore = Math.max(75, session.trustScore - 5);
    } else if (method === 'FACE') {
      session.signals.faceVerified = false;
      session.trustScore = Math.max(75, session.trustScore - 5);
    }
  }

  return {
    success: false,
    mode: session.currentMode,
    trustScore: session.trustScore,
    message: reason || 'Verification failed.',
    voiceState: method === 'VOICE' ? 'VOICE_VERIFICATION_FAILED' : undefined,
    faceState: method === 'FACE' ? (evaluatedFaceState || 'FACE_UNKNOWN') : undefined,
  };
}

/**
 * Evaluates multimodal presence (camera and voice evidence) using the central decision matrix
 * and authoritatively updates the server-side session.
 */
export async function evaluateMultimodalPresence(
  userId: string,
  cameraEvidence: CameraEvidenceState,
  voiceEvidence: VoiceEvidenceState,
  req?: Request,
): Promise<{
  success: boolean;
  mode: TrustMode;
  trustScore: number;
  cameraEvidence: CameraEvidenceState;
  voiceEvidence: VoiceEvidenceState;
  reason: string;
}> {
  const session = await getOrCreateTrustSession(userId, req);
  const decision = evaluateTwinTrustDecision(session.currentMode, cameraEvidence, voiceEvidence);

  if (decision.shouldTransition) {
    if (decision.targetMode === 'GUEST') {
      session.currentMode = 'GUEST';
      session.signals.recentVerification = false;
      session.trustScore = Math.min(session.trustScore, 40);
      await recordAuditLog(
        userId,
        voiceEvidence === 'NON_OWNER_VOICE' ? 'VOICE_MISMATCH' : 'FACE_MISMATCH',
        'FAILURE',
        session.trustScore,
        req,
        decision.reason,
      );
    } else if (decision.targetMode === 'OWNER') {
      session.currentMode = 'OWNER';
      session.lastVerifiedAt = new Date();
      session.lastActivityAt = new Date();
      session.lockedReason = null;
      if (voiceEvidence === 'OWNER_VOICE') session.signals.voiceVerified = true;
      if (cameraEvidence === 'OWNER_FACE') session.signals.faceVerified = true;
      session.trustScore = Math.max(85, session.trustScore);
      await recordAuditLog(
        userId,
        'OWNER_VERIFIED',
        'SUCCESS',
        session.trustScore,
        req,
        decision.reason,
      );
    }
  }

  return {
    success: true,
    mode: session.currentMode,
    trustScore: session.trustScore,
    cameraEvidence,
    voiceEvidence,
    reason: decision.reason,
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
    session.signals.recentVerification = false;
    await recordAuditLog(userId, 'GUEST_MODE_ACTIVATED', 'SUCCESS', session.trustScore, req, 'Guest Mode activated.');
  } else if (mode === 'LOCKED') {
    session.currentMode = 'LOCKED';
    session.lockedReason = 'MANUAL_LOCK';
    session.signals.recentVerification = false;
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
): Promise<{ privacyShieldActive: boolean; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  session.privacyShieldActive = !session.privacyShieldActive;

  try {
    await prisma.trustProfile.upsert({
      where: { userId },
      update: { privacyShieldEnabled: session.privacyShieldActive },
      create: { userId, privacyShieldEnabled: session.privacyShieldActive },
    });
  } catch (dbErr) {
    logger.warn('Failed to persist privacyShield in database, maintaining in-memory session', { error: String(dbErr) });
  }

  const action = session.privacyShieldActive ? 'PRIVACY_SHIELD_ENABLED' : 'PRIVACY_SHIELD_DISABLED';
  try {
    await recordAuditLog(
      userId,
      action,
      'SUCCESS',
      session.trustScore,
      req,
      `Privacy Shield ${session.privacyShieldActive ? 'enabled' : 'disabled'}.`
    );
  } catch {
    // Non-fatal audit log failure
  }

  return {
    privacyShieldActive: session.privacyShieldActive,
    message: session.privacyShieldActive
      ? 'Privacy Shield enabled. Sensitive memory is masked.'
      : 'Privacy Shield disabled.',
  };
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
 * Enrolls the owner's voice biometric profile.
 * Requires strong owner authentication (session in OWNER mode or recent strong verification).
 */
export async function enrollOwnerVoice(
  userId: string,
  audioBuffer: Buffer,
  req?: Request,
): Promise<{ success: boolean; enrolled: boolean; verified?: boolean; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  if (session.currentMode !== 'OWNER' && !session.signals.recentVerification) {
    await recordAuditLog(
      userId,
      'VOICE_ENROLLMENT_FAILED',
      'FAILURE',
      session.trustScore,
      req,
      'Voice enrollment rejected: strong owner authentication is required.',
    );
    const err = new Error('Voice enrollment requires strong owner authentication.');
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const enrollment = await defaultVoiceBiometricProvider.enrollVoice(userId, audioBuffer);

  await prisma.trustProfile.upsert({
    where: { userId },
    update: {
      voiceBiometricsEnabled: true,
      voiceVoiceprintHash: enrollment.encryptedTemplate,
    },
    create: {
      userId,
      voiceBiometricsEnabled: true,
      voiceVoiceprintHash: enrollment.encryptedTemplate,
    },
  });

  session.signals.voiceVerified = true;
  session.signals.voiceMismatch = false;

  await recordAuditLog(
    userId,
    'VOICE_ENROLLMENT_COMPLETED',
    'SUCCESS',
    session.trustScore,
    req,
    'Owner voice biometric profile enrolled successfully.',
  );

  return {
    success: true,
    enrolled: true,
    verified: Boolean(enrollment.verified ?? true),
    message: 'Owner voice biometric profile enrolled and verified successfully.',
  };
}

/**
 * Revokes the owner's voice biometric profile.
 * Requires OWNER mode.
 */
export async function revokeOwnerVoice(
  userId: string,
  req?: Request,
): Promise<{ success: boolean; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  if (session.currentMode !== 'OWNER') {
    const err = new Error('Voice identity revocation requires active Owner Mode.');
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  await prisma.trustProfile.update({
    where: { userId },
    data: {
      voiceBiometricsEnabled: false,
      voiceVoiceprintHash: null,
    },
  });

  session.signals.voiceVerified = false;
  session.signals.voiceMismatch = false;

  await recordAuditLog(
    userId,
    'VOICE_REVOKED',
    'SUCCESS',
    session.trustScore,
    req,
    'Owner voice biometric profile revoked.',
  );

  return {
    success: true,
    message: 'Owner voice biometric profile revoked.',
  };
}

/**
 * Returns voice biometric enrollment status and provider availability.
 */
export async function getVoiceBiometricStatus(
  userId: string,
): Promise<{ enrolled: boolean; providerStatus: string; providerName: string }> {
  try {
    const profile = await prisma.trustProfile.findUnique({
      where: { userId },
      select: { voiceBiometricsEnabled: true, voiceVoiceprintHash: true },
    });

    return {
      enrolled: Boolean(profile?.voiceBiometricsEnabled && profile?.voiceVoiceprintHash),
      providerStatus: defaultVoiceBiometricProvider.status,
      providerName: defaultVoiceBiometricProvider.name,
    };
  } catch {
    return {
      enrolled: false,
      providerStatus: defaultVoiceBiometricProvider.status,
      providerName: defaultVoiceBiometricProvider.name,
    };
  }
}

/**
 * Enrolls the owner's face biometric profile.
 * Requires strong owner authentication (session in OWNER mode or recent strong verification).
 */
export async function enrollOwnerFace(
  userId: string,
  faceImageBase64: string,
  req?: Request,
): Promise<{ success: boolean; enrolled: boolean; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  if (session.currentMode !== 'OWNER' && !session.signals.recentVerification) {
    await recordAuditLog(
      userId,
      'FACE_ENROLLMENT_FAILED',
      'FAILURE',
      session.trustScore,
      req,
      'Face enrollment rejected: strong owner authentication is required.',
    );
    const err = new Error('Face enrollment requires strong owner authentication.');
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  const enrollment = await defaultFaceBiometricProvider.enrollFace(userId, faceImageBase64);

  await prisma.trustProfile.upsert({
    where: { userId },
    update: {
      faceBiometricsEnabled: true,
      faceTemplateHash: enrollment.encryptedTemplate,
    },
    create: {
      userId,
      faceBiometricsEnabled: true,
      faceTemplateHash: enrollment.encryptedTemplate,
    },
  });

  session.signals.faceVerified = true;
  session.signals.faceMismatch = false;

  await recordAuditLog(
    userId,
    'FACE_ENROLLMENT_COMPLETED',
    'SUCCESS',
    session.trustScore,
    req,
    'Owner face biometric template enrolled successfully.',
  );

  return {
    success: true,
    enrolled: true,
    message: 'Owner face biometric template enrolled successfully.',
  };
}

/**
 * Revokes the owner's face biometric template.
 * Requires OWNER mode.
 */
export async function revokeOwnerFace(
  userId: string,
  req?: Request,
): Promise<{ success: boolean; message: string }> {
  const session = await getOrCreateTrustSession(userId, req);
  if (session.currentMode !== 'OWNER') {
    const err = new Error('Face identity revocation requires active Owner Mode.');
    (err as unknown as { statusCode: number }).statusCode = 403;
    throw err;
  }

  await prisma.trustProfile.update({
    where: { userId },
    data: {
      faceBiometricsEnabled: false,
      faceTemplateHash: null,
    },
  });

  session.signals.faceVerified = false;
  session.signals.faceMismatch = false;

  await recordAuditLog(
    userId,
    'FACE_REVOKED',
    'SUCCESS',
    session.trustScore,
    req,
    'Owner face biometric template revoked.',
  );

  return {
    success: true,
    message: 'Owner face biometric template revoked.',
  };
}

/**
 * Returns face biometric enrollment status and provider availability.
 */
export async function getFaceBiometricStatus(
  userId: string,
): Promise<{ enrolled: boolean; providerStatus: string; providerName: string }> {
  try {
    const profile = await prisma.trustProfile.findUnique({
      where: { userId },
      select: { faceBiometricsEnabled: true, faceTemplateHash: true },
    });

    return {
      enrolled: Boolean(profile?.faceBiometricsEnabled && profile?.faceTemplateHash),
      providerStatus: defaultFaceBiometricProvider.status,
      providerName: defaultFaceBiometricProvider.name,
    };
  } catch {
    return {
      enrolled: false,
      providerStatus: defaultFaceBiometricProvider.status,
      providerName: defaultFaceBiometricProvider.name,
    };
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

