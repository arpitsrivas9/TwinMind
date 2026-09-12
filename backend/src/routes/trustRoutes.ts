import { Router } from 'express';
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
} from '../services/trust/trustSessionService';
import { calculateTrustScore } from '../services/trust/trustEngine';

const router = Router();

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
    return next(err);
  }
});

export default router;
