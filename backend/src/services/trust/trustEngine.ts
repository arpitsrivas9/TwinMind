import crypto from 'crypto';
import type { Request } from 'express';
import { TrustMode, TrustScoreBreakdown, TrustSignals } from './trustTypes';

/**
 * Computes an explainable Trust Score (0 - 100) and evaluates the resulting Trust State.
 */
export function calculateTrustScore(
  signals: Partial<TrustSignals>,
  isExplicitLocked = false,
  isExplicitGuest = false,
): TrustScoreBreakdown {
  if (isExplicitLocked) {
    return {
      score: 0,
      state: 'LOCKED',
      signals: {
        authenticated: Boolean(signals.authenticated),
        trustedDevice: Boolean(signals.trustedDevice),
        osAuthVerified: Boolean(signals.osAuthVerified),
        voiceVerified: Boolean(signals.voiceVerified),
        faceVerified: Boolean(signals.faceVerified),
        livenessVerified: Boolean(signals.livenessVerified),
        recentVerification: Boolean(signals.recentVerification),
        networkTrusted: Boolean(signals.networkTrusted),
      },
      reasons: ['System is explicitly locked or inactivity timeout exceeded.'],
    };
  }

  const fullSignals: TrustSignals = {
    authenticated: Boolean(signals.authenticated),
    trustedDevice: Boolean(signals.trustedDevice),
    osAuthVerified: Boolean(signals.osAuthVerified),
    voiceVerified: Boolean(signals.voiceVerified),
    faceVerified: Boolean(signals.faceVerified),
    livenessVerified: Boolean(signals.livenessVerified),
    recentVerification: Boolean(signals.recentVerification),
    networkTrusted: Boolean(signals.networkTrusted),
  };

  let score = 0;
  const reasons: string[] = [];

  // Base authentication
  if (fullSignals.authenticated) {
    score += 30;
    reasons.push('Authenticated session token verified (+30)');
  } else {
    reasons.push('Unauthenticated (0)');
    return { score: 0, state: 'LOCKED', signals: fullSignals, reasons };
  }

  // Trusted device
  if (fullSignals.trustedDevice) {
    score += 25;
    reasons.push('Recognized trusted device verified (+25)');
  } else {
    score -= 15;
    reasons.push('Unrecognized or untrusted device (-15)');
  }

  // OS Authentication (Passkey / WebAuthn)
  if (fullSignals.osAuthVerified) {
    score += 25;
    reasons.push('Platform OS authentication verified (+25)');
  }

  // Biometrics
  if (fullSignals.voiceVerified) {
    score += 20;
    reasons.push('Voice biometric match confirmed (+20)');
  }

  if (fullSignals.faceVerified) {
    score += 20;
    reasons.push('Face recognition match confirmed (+20)');
    if (fullSignals.livenessVerified) {
      score += 10;
      reasons.push('Liveness test passed (+10)');
    }
  }

  // Recent verification window (within last 15 minutes)
  if (fullSignals.recentVerification) {
    score += 15;
    reasons.push('Recent verification window active (+15)');
  }

  // Trusted network
  if (fullSignals.networkTrusted) {
    score += 5;
    reasons.push('Known network context (+5)');
  }

  // Clamp score to 0 - 100
  const clampedScore = Math.max(0, Math.min(100, score));

  // Determine state
  let state: TrustMode;
  if (isExplicitGuest) {
    state = 'GUEST';
    reasons.push('Guest Mode explicitly selected by user.');
  } else if (clampedScore >= 75) {
    state = 'OWNER';
    reasons.push('High confidence trust threshold met -> OWNER MODE granted.');
  } else if (clampedScore < 25) {
    state = 'LOCKED';
    reasons.push('Low confidence trust score -> System LOCKED.');
  } else {
    state = 'GUEST';
    reasons.push('Moderate trust score -> Defaulted to GUEST MODE.');
  }

  return {
    score: clampedScore,
    state,
    signals: fullSignals,
    reasons,
  };
}

/**
 * Derives a privacy-preserving deviceKey from client token and user-agent.
 * Never exposes hardware fingerprints or serial numbers.
 */
export function generateDeviceKey(clientDeviceToken: string, userAgent = ''): string {
  const seed = `${clientDeviceToken || 'unknown_token'}:${userAgent.slice(0, 100)}`;
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Extracts and normalizes client IP address safely.
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || '127.0.0.1';
}
