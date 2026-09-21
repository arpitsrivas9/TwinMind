import {
  CameraEvidenceState,
  VoiceEvidenceState,
  TrustMode,
} from './trustTypes';

export interface DecisionResult {
  targetMode: TrustMode;
  reason: string;
  shouldTransition: boolean;
}

/**
 * Authoritative Server-Side TwinTrust™ Multimodal Decision Matrix.
 * Evaluates visual presence evidence and acoustic speaker evidence to enforce
 * the correct TrustMode on the session.
 */
export function evaluateTwinTrustDecision(
  currentMode: TrustMode,
  camera: CameraEvidenceState,
  voice: VoiceEvidenceState,
): DecisionResult {
  if (currentMode === 'LOCKED') {
    return {
      targetMode: 'LOCKED',
      reason: 'System is locked. Explicit verification required to unlock.',
      shouldTransition: false,
    };
  }

  // 1. Confident non-owner voice demotes to GUEST immediately (Case B, D)
  // Face presence MUST NOT override a confident non-owner speaker result!
  if (voice === 'NON_OWNER_VOICE') {
    return {
      targetMode: 'GUEST',
      reason:
        camera === 'OWNER_FACE'
          ? 'Non-owner speaker detected while owner face is visible. Active speaker takes precedence.'
          : 'Non-owner speaker verified. Demoting session to Guest Mode to isolate owner data.',
      shouldTransition: currentMode !== 'GUEST',
    };
  }

  // 2. Confident owner voice restores or maintains OWNER (Case A, C, G)
  if (voice === 'OWNER_VOICE') {
    return {
      targetMode: 'OWNER',
      reason:
        currentMode === 'GUEST'
          ? 'Owner voice verified. Restoring Owner Mode privileges.'
          : 'Owner voice verified acoustic match.',
      shouldTransition: currentMode !== 'OWNER',
    };
  }

  // 3. Owner face is present with No Speech or Unknown Voice (Case A, F)
  if (camera === 'OWNER_FACE') {
    if (currentMode === 'GUEST') {
      return {
        targetMode: 'OWNER',
        reason: 'Owner face visually verified. Restoring Owner Mode.',
        shouldTransition: true,
      };
    }

    if (voice === 'UNKNOWN_VOICE') {
      // Case F: Ambiguous voice window does not revoke Owner mode when Owner face is present
      return {
        targetMode: 'OWNER',
        reason: 'Owner face confirmed; ambiguous voice sample did not revoke Owner state.',
        shouldTransition: false,
      };
    }

    return {
      targetMode: 'OWNER',
      reason: 'Owner face actively present in camera frame.',
      shouldTransition: false,
    };
  }

  // 4. Sustained UNKNOWN_FACE (intruder in front of camera without owner voice)
  if (camera === 'UNKNOWN_FACE') {
    return {
      targetMode: 'GUEST',
      reason: 'Persistent unverified face detected in front of screen.',
      shouldTransition: currentMode !== 'GUEST',
    };
  }

  // 5. No camera / Camera unavailable + Silence / Inconclusive (Case E, 11, 18)
  return {
    targetMode: currentMode,
    reason: `Preserving current ${currentMode} state (camera: ${camera}, voice: ${voice}).`,
    shouldTransition: false,
  };
}
