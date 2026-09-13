import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { errorResponse, successResponse } from '../utils/apiResponse';
import { prisma } from '../lib/prisma';
import {
  getOrCreateTrustSession,
  verifyOwnerIdentity,
  setTrustMode,
  togglePrivacyShield,
  generateOsAuthChallenge,
  registerCurrentDevice,
  revokeTrustedDevice,
  enrollOwnerVoice,
  revokeOwnerVoice,
  getVoiceBiometricStatus,
} from '../services/trust/trustSessionService';
import { calculateTrustScore } from '../services/trust/trustEngine';

const router = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const handleAudioUpload = (req: Request, res: Response, next: NextFunction) => {
  audioUpload.single('audio')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json(errorResponse('Audio file exceeds the 15MB limit'));
      }
      return res.status(400).json(errorResponse(err.message));
    } else if (err) {
      return res.status(400).json(errorResponse('Failed to parse audio upload'));
    }
    next();
  });
};

const verifySchema = z.object({
  method: z.enum(['OS_AUTH', 'VOICE', 'FACE']),
  challengeResponse: z.string().optional(),
  audioBase64: z.string().optional(),
  faceImageBase64: z.string().optional(),
  livenessFrames: z.array(z.string()).optional(),
});

const modeSchema = z.object({
  mode: z.enum(['OWNER', 'GUEST', 'LOCKED']),
});

const deviceSchema = z.object({
  label: z.string().min(1).max(120),
});

/**
 * GET /api/trust/status
 * Returns current trust session status, score, breakdown, and Privacy Shield state.
 */
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = await getOrCreateTrustSession(req.user!.id, req);
    const breakdown = calculateTrustScore(
      session.signals,
      session.currentMode === 'LOCKED',
      session.currentMode === 'GUEST',
    );

    return res.status(200).json(
      successResponse({
        mode: session.currentMode,
        trustScore: session.trustScore,
        privacyShieldActive: session.privacyShieldActive,
        lockedReason: session.lockedReason,
        lastVerifiedAt: session.lastVerifiedAt,
        autoLockMinutes: session.autoLockMinutes ?? 60,
        breakdown,
      }),
    );
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/trust/verify
 * Performs biometric or OS authentication to elevate to Owner Mode.
 */
router.post('/verify', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const { method, challengeResponse, audioBase64, faceImageBase64, livenessFrames } = parsed.data;
    const audioBuffer = audioBase64 ? Buffer.from(audioBase64, 'base64') : undefined;

    const result = await verifyOwnerIdentity(
      req.user!.id,
      method,
      { challengeResponse, audioBuffer, faceImageBase64, livenessFrames },
      req,
    );

    return res.status(result.success ? 200 : 401).json(
      result.success ? successResponse(result) : errorResponse(result.message, result),
    );
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/trust/mode
 * Explicitly toggles between OWNER, GUEST, or LOCKED.
 */
router.post('/mode', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = modeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const updated = await setTrustMode(req.user!.id, parsed.data.mode, req);
    return res.status(200).json(
      successResponse({
        mode: updated.currentMode,
        trustScore: updated.trustScore,
        privacyShieldActive: updated.privacyShieldActive,
      }),
    );
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/trust/lock
 * Immediately locks TwinMind.
 */
router.post('/lock', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const updated = await setTrustMode(req.user!.id, 'LOCKED', req);
    return res.status(200).json(successResponse({ mode: updated.currentMode, trustScore: 0 }));
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/trust/privacy-shield
 * Toggles Privacy Shield on/off.
 */
router.post('/privacy-shield', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await togglePrivacyShield(req.user!.id, req);
    return res.status(200).json(successResponse(result));
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/trust/voice/status
 * Returns current voice biometric enrollment status and provider details.
 */
router.get('/voice/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = await getVoiceBiometricStatus(req.user!.id);
    return res.status(200).json(successResponse(status));
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/trust/voice/enroll
 * Enrolls owner voice biometric profile. Requires strong owner authentication.
 */
router.post('/voice/enroll', requireAuth, handleAudioUpload, async (req: AuthenticatedRequest, res) => {
  try {
    let audioBuffer: Buffer | undefined;

    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body?.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
    }

    if (!audioBuffer) {
      return res.status(400).json(errorResponse('Audio sample is required for voice enrollment'));
    }

    const result = await enrollOwnerVoice(req.user!.id, audioBuffer, req);
    return res.status(201).json(successResponse(result));
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    if (error.statusCode === 403 || error.message?.includes('strong owner authentication')) {
      return res.status(403).json(errorResponse(error.message));
    }
    return res.status(400).json(errorResponse(error.message || 'Voice enrollment failed'));
  }
});

/**
 * POST /api/trust/voice/verify
 * Compares audio sample against enrolled owner voiceprint.
 */
router.post('/voice/verify', requireAuth, handleAudioUpload, async (req: AuthenticatedRequest, res) => {
  try {
    let audioBuffer: Buffer | undefined;

    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body?.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
    }

    if (!audioBuffer) {
      return res.status(400).json(errorResponse('Audio sample is required for voice verification'));
    }

    const result = await verifyOwnerIdentity(req.user!.id, 'VOICE', { audioBuffer }, req);
    return res.status(result.success ? 200 : 401).json(
      result.success ? successResponse(result) : errorResponse(result.message, result),
    );
  } catch (err: unknown) {
    const error = err as Error;
    return res.status(400).json(errorResponse(error.message || 'Voice verification error'));
  }
});

/**
 * DELETE /api/trust/voice/enrollment
 * Revokes enrolled voice biometric profile. Requires Owner Mode.
 */
router.delete('/voice/enrollment', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await revokeOwnerVoice(req.user!.id, req);
    return res.status(200).json(successResponse(result));
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    if (error.statusCode === 403 || error.message?.includes('Owner Mode')) {
      return res.status(403).json(errorResponse(error.message));
    }
    return res.status(400).json(errorResponse(error.message || 'Failed to revoke voice biometric profile'));
  }
});

/**
 * POST /api/trust/os-auth/challenge
 * Generates a challenge for platform WebAuthn passkey handshake.
 */
router.post('/os-auth/challenge', requireAuth, (req: AuthenticatedRequest, res) => {
  const challengeData = generateOsAuthChallenge(req.user!.id);
  return res.status(200).json(successResponse(challengeData));
});

/**
 * GET /api/trust/devices
 * Lists trusted devices for the authenticated user.
 */
router.get('/devices', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const devices = await prisma.trustedDevice.findMany({
      where: { userId: req.user!.id },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        label: true,
        userAgent: true,
        ipAddress: true,
        isTrusted: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return res.status(200).json(successResponse(devices));
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      return res.status(200).json(successResponse([]));
    }
    return next(err);
  }
});

/**
 * POST /api/trust/devices/register
 * Registers the current device as trusted.
 */
router.post('/devices/register', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const parsed = deviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(errorResponse('Validation failed', { issues: parsed.error.issues }));
    }

    const device = await registerCurrentDevice(req.user!.id, parsed.data.label, req);
    return res.status(201).json(successResponse(device));
  } catch (err) {
    return next(err);
  }
});

/**
 * DELETE /api/trust/devices/:id
 * Revokes trust from a registered device (with IDOR protection).
 */
router.delete('/devices/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const deviceId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const revoked = await revokeTrustedDevice(req.user!.id, deviceId, req);
    if (!revoked) {
      return res.status(404).json(errorResponse('Device not found or unauthorized'));
    }
    return res.status(200).json(successResponse(revoked));
  } catch (err) {
    return next(err);
  }
});

/**
 * GET /api/trust/audit-logs
 * Retrieves security audit log history (IDOR-protected, strictly scoped to user).
 */
router.get('/audit-logs', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const logs = await prisma.securityAuditLog.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        action: true,
        status: true,
        trustScore: true,
        ipAddress: true,
        userAgent: true,
        details: true,
        createdAt: true,
      },
    });
    return res.status(200).json(successResponse(logs));
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      return res.status(200).json(successResponse([]));
    }
    return next(err);
  }
});

export default router;
